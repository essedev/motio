import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AudioIntent } from "@motiojs/core/protocol";
import { type CancelSignal, toAbortController } from "./cancel.js";
import { collectAudioIntents } from "./capture-video.js";
import { MotioError } from "./errors.js";
import {
	type FrameRange,
	oneOf,
	resolveConcurrency,
	resolveFrames,
	resolveJpegQuality,
	resolveScale,
} from "./options.js";
import { compositionPageFactory } from "./page-factory.js";
import { DEFAULT_CRASH_RETRIES, DEFAULT_RECYCLE_EVERY_N_FRAMES, runPool } from "./pool.js";
import {
	type BrowserSessionOptions,
	openSession,
	type VideoConfig,
	validateComposition,
} from "./session.js";
import type { RenderWarning } from "./warnings.js";

/** Data passed to `onStart`. */
export interface OnStartData {
	frameCount: number;
	parallelEncoding: boolean;
	resolvedConcurrency: number;
}

/** Where `renderFrames()` wrote its images. */
export interface RenderedImageSequence {
	/** Absolute directory of the images. */
	directory: string;
	/** File name pattern with `[frame]` and `[ext]`. */
	pattern: string;
	imageFormat: "jpeg" | "png";
	/** Digits `[frame]` is zero-padded to. */
	padding: number;
}

/** Audio a frame plays, as the page reported it. */
export interface FrameAudio {
	frame: number;
	intents: AudioIntent[];
}

/**
 * What `renderFrames()` collected for `stitchFramesToVideo()`. Like Remotion's, the shape is not
 * stable between versions: pass it on as is.
 */
export interface RenderAssetInfo {
	/** Composition frames rendered, in output order. */
	frames: number[];
	/** The images on disk, or null when they went to `onFrameBuffer` only. */
	imageSequence: RenderedImageSequence | null;
	/** Frame rate of the composition, which the audio positions are counted in. */
	fps: number;
	/** Composition frames the audio covers, in order; empty when muted. */
	audioFrames: number[];
	/** The frames of `audioFrames` that play audio. */
	audio: FrameAudio[];
	/** The bundle the frames came from, so local media sources resolve after the render. */
	bundle: { url: string; directory: string | null };
}

/** Options of `renderFrames()`. */
export interface RenderFramesOptions extends BrowserSessionOptions {
	composition: VideoConfig;
	/** Directory to write images to, or null to receive them through `onFrameBuffer`. */
	outputDir: string | null;
	/** File name pattern; `[frame]` is the zero-padded frame number, `[ext]` the extension. */
	imageSequencePattern?: string;
	onStart?: (data: OnStartData) => void;
	/** Called after each frame with the count so far, the frame number and its render time. */
	onFrameUpdate?: (
		framesRendered: number,
		frame: number,
		timeToRenderInMilliseconds: number,
	) => void;
	/** Receives each image when `outputDir` is null; a returned promise applies backpressure. */
	onFrameBuffer?: (buffer: Buffer, frame: number) => void | Promise<void>;
	imageFormat?: "jpeg" | "png" | "none";
	jpegQuality?: number;
	scale?: number;
	concurrency?: number | string | null;
	frameRange?: FrameRange | null;
	/** Exact frames to render, in ascending order; excludes `frameRange` and `everyNthFrame`. */
	frames?: number[];
	everyNthFrame?: number;
	muted?: boolean;
	cancelSignal?: CancelSignal;
	/** Motio extension: replace each page with a fresh one after this many frames. Default 500; 0 never. */
	recycleEveryNFrames?: number;
	/**
	 * Motio extension: reorders the frames before they are requested, for example in descending
	 * or random order to check determinism. Must return the same frames. Default: ascending.
	 */
	frameOrder?: (frames: number[]) => number[];
}

/** Result of `renderFrames()`. */
export interface RenderFramesResult {
	frameCount: number;
	assetsInfo: RenderAssetInfo;
	/** Motio extension: warnings the page reported, each once (see `RenderWarning`). */
	warnings: RenderWarning[];
}

function framesToRender(options: RenderFramesOptions): number[] {
	const { composition } = options;
	if (options.frames === undefined) {
		return resolveFrames(options.frameRange, options.everyNthFrame, composition.durationInFrames);
	}
	if (options.frameRange !== undefined && options.frameRange !== null) {
		throw new MotioError("E_INVALID_OPTION", "frames cannot be combined with frameRange");
	}
	if (options.everyNthFrame !== undefined && options.everyNthFrame !== 1) {
		throw new MotioError("E_INVALID_OPTION", "frames cannot be combined with everyNthFrame");
	}
	const sorted = [...new Set(options.frames)].sort((a, b) => a - b);
	for (const f of sorted) {
		if (!Number.isInteger(f) || f < 0 || f >= composition.durationInFrames) {
			throw new MotioError(
				"E_INVALID_OPTION",
				`frames contains ${f}, outside the composition (0 to ${composition.durationInFrames - 1})`,
			);
		}
	}
	return sorted;
}

function orderFrames(frames: number[], frameOrder: RenderFramesOptions["frameOrder"]): number[] {
	if (!frameOrder) return frames;
	const order = frameOrder([...frames]);
	const same =
		order.length === frames.length &&
		[...order].sort((a, b) => a - b).every((f, i) => f === frames[i]);
	if (!same)
		throw new MotioError("E_INVALID_OPTION", "frameOrder must return the same frames it was given");
	return order;
}

/** Renders frames of a composition to image files or to a callback, without encoding. */
export async function renderFrames(options: RenderFramesOptions): Promise<RenderFramesResult> {
	const { composition } = options;
	validateComposition(composition);
	const imageFormat = oneOf(
		"imageFormat",
		options.imageFormat,
		["jpeg", "png", "none"] as const,
		"jpeg",
	);
	if (imageFormat === "none") {
		throw new MotioError(
			"E_INVALID_OPTION",
			'imageFormat "none" (audio only) is not supported yet',
		);
	}
	const quality = resolveJpegQuality(imageFormat, options.jpegQuality);
	const scale = resolveScale(options.scale);
	const concurrency = resolveConcurrency(options.concurrency);
	const frames = framesToRender(options);
	if (options.outputDir === null && !options.onFrameBuffer) {
		throw new MotioError(
			"E_INVALID_OPTION",
			"Pass outputDir or onFrameBuffer to receive the frames",
		);
	}
	const pattern = options.imageSequencePattern ?? "element-[frame].[ext]";
	if (!pattern.includes("[frame]")) {
		throw new MotioError("E_INVALID_OPTION", 'imageSequencePattern must contain "[frame]"');
	}
	const padding = String(composition.durationInFrames - 1).length;
	const outputDir = options.outputDir === null ? null : resolve(options.outputDir);
	if (outputDir) await mkdir(outputDir, { recursive: true });

	const controller = toAbortController(options.cancelSignal, "renderFrames");
	const session = await openSession(options);
	try {
		options.onStart?.({
			frameCount: frames.length,
			parallelEncoding: false,
			resolvedConcurrency: concurrency,
		});
		let rendered = 0;
		const muted = options.muted === true;
		const intents = new Map<number, AudioIntent[]>();
		const openPage = compositionPageFactory(session, composition, {
			width: composition.width,
			height: composition.height,
			scale,
			transparent: imageFormat === "png",
			concurrency,
		});
		const recycleEveryNFrames = options.recycleEveryNFrames ?? DEFAULT_RECYCLE_EVERY_N_FRAMES;
		await runPool({
			frames: orderFrames(frames, options.frameOrder),
			concurrency,
			openPage,
			format: imageFormat,
			quality,
			recycleEveryNFrames,
			crashRetries: DEFAULT_CRASH_RETRIES,
			signal: controller.signal,
			onFrame: async ({ frame, image, report, timeMs }) => {
				if (!muted) intents.set(frame, report.audio);
				if (outputDir) {
					const name = pattern
						.replaceAll("[frame]", String(frame).padStart(padding, "0"))
						.replaceAll("[ext]", imageFormat);
					await writeFile(join(outputDir, name), image);
				}
				if (options.onFrameBuffer) await options.onFrameBuffer(image, frame);
				rendered++;
				options.onFrameUpdate?.(rendered, frame, timeMs);
			},
		});
		// The audio covers every frame of the range, also those `everyNthFrame` skips (D-030).
		const audioFrames = muted
			? []
			: options.frames === undefined
				? resolveFrames(options.frameRange, 1, composition.durationInFrames)
				: frames;
		await collectAudioIntents({
			audioFrames,
			intents,
			openPage,
			concurrency,
			recycleEveryNFrames,
			signal: controller.signal,
		});
		return {
			frameCount: frames.length,
			warnings: session.warnings.list(),
			assetsInfo: {
				frames,
				imageSequence: outputDir ? { directory: outputDir, pattern, imageFormat, padding } : null,
				fps: composition.fps,
				audioFrames,
				audio: audioFrames
					.map((frame) => ({ frame, intents: intents.get(frame) ?? [] }))
					.filter((entry) => entry.intents.length > 0),
				bundle: {
					url: session.server.url,
					directory: /^https?:\/\//i.test(options.serveUrl) ? null : resolve(options.serveUrl),
				},
			},
		};
	} finally {
		await session.close();
	}
}
