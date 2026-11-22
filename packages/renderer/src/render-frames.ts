import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AudioIntent } from "@motiojs/core/protocol";
import { type CancelSignal, toAbortController } from "./cancel.js";
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

/** Data passed to `onStart`. */
export interface OnStartData {
	frameCount: number;
	parallelEncoding: boolean;
	resolvedConcurrency: number;
}

/** What the render collected for later stitching; the audio part is filled in M3. */
export interface RenderAssetInfo {
	/** Composition frames rendered, in output order. */
	frames: number[];
	audio: AudioIntent[];
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
		await runPool({
			frames: orderFrames(frames, options.frameOrder),
			concurrency,
			openPage: compositionPageFactory(session, composition, {
				width: composition.width,
				height: composition.height,
				scale,
				transparent: imageFormat === "png",
			}),
			format: imageFormat,
			quality,
			recycleEveryNFrames: options.recycleEveryNFrames ?? DEFAULT_RECYCLE_EVERY_N_FRAMES,
			crashRetries: DEFAULT_CRASH_RETRIES,
			signal: controller.signal,
			onFrame: async ({ frame, image, timeMs }) => {
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
		return { frameCount: frames.length, assetsInfo: { frames, audio: [] } };
	} finally {
		await session.close();
	}
}
