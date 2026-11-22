import { readFile } from "node:fs/promises";
import { type CancelSignal, toAbortController } from "./cancel.js";
import { MotioError } from "./errors.js";
import {
	assertFfmpegSupports,
	Encoder,
	h264Args,
	probeFfmpeg,
	resolveFfmpegPath,
} from "./ffmpeg.js";
import {
	assertDimensionsFit,
	CODECS,
	COLOR_SPACES,
	type Codec,
	type ColorSpace,
	type FrameRange,
	oneOf,
	PIXEL_FORMATS,
	type PixelFormat,
	resolveConcurrency,
	resolveCrf,
	resolveFrames,
	resolveJpegQuality,
	resolveScale,
	scaledSize,
	X264_PRESETS,
	type X264Preset,
} from "./options.js";
import { prepareOutput } from "./output.js";
import { compositionPageFactory } from "./page-factory.js";
import {
	DEFAULT_CRASH_RETRIES,
	DEFAULT_RECYCLE_EVERY_N_FRAMES,
	runPool,
	type SlowFrame,
} from "./pool.js";
import type { OnStartData } from "./render-frames.js";
import { ReorderBuffer } from "./reorder-buffer.js";
import {
	type BrowserSessionOptions,
	openSession,
	type VideoConfig,
	validateComposition,
} from "./session.js";

/** Progress reported by `renderMedia()`. */
export interface RenderMediaProgress {
	renderedFrames: number;
	encodedFrames: number;
	/** Milliseconds the rendering took, once done. */
	renderedDoneIn: number | null;
	/** Milliseconds the encoding took, once done. */
	encodedDoneIn: number | null;
	stitchStage: "encoding" | "muxing";
	/** Overall progress from 0 to 1. */
	progress: number;
}

/** Options of `renderMedia()`. */
export interface RenderMediaOptions extends BrowserSessionOptions {
	composition: VideoConfig;
	/** Motio M1 encodes `h264` only; other Remotion codecs fail with `E_UNSUPPORTED_CODEC`. */
	codec: Codec;
	/** Output file; null or unset returns the video as a buffer. */
	outputLocation?: string | null;
	/** Default true. */
	overwrite?: boolean;
	/** Constant rate factor, 1 to 51 for H.264. Default 18. */
	crf?: number | null;
	/** Default `jpeg`. */
	imageFormat?: "jpeg" | "png" | "none";
	/** Default 80. */
	jpegQuality?: number;
	frameRange?: FrameRange | null;
	/** Renders every nth frame; the output frame rate is divided by n to keep the duration. */
	everyNthFrame?: number;
	/** Pages rendering in parallel: a number, a percentage of CPU threads, or null for the default. */
	concurrency?: number | string | null;
	/** Device scale factor; output size is the composition size times `scale`. Default 1. */
	scale?: number;
	/** Default `yuv420p`. */
	pixelFormat?: PixelFormat;
	/** Default `default`, which Motio encodes as BT.709 with explicit conversion and tags. */
	colorSpace?: ColorSpace;
	/** Default `medium`. */
	x264Preset?: X264Preset | null;
	/** Audio is not rendered before M3; `muted` is accepted and is the only behaviour. */
	muted?: boolean;
	cancelSignal?: CancelSignal;
	onStart?: (data: OnStartData) => void;
	onProgress?: (progress: RenderMediaProgress) => void;
	/** Motio extension: FFmpeg executable. Default `$MOTIO_FFMPEG`, else `ffmpeg` on PATH. */
	ffmpegExecutable?: string | null;
	/** Motio extension: replace each page with a fresh one after this many frames. Default 500; 0 never. */
	recycleEveryNFrames?: number;
}

/** Result of `renderMedia()`. */
export interface RenderMediaResult {
	/** The video, or null when it was written to `outputLocation`. */
	buffer: Buffer | null;
	/** The ten slowest frames with their seek plus capture time in milliseconds. */
	slowestFrames: SlowFrame[];
	contentType: string;
}

/** Test hooks; not part of the public API. */
export interface RenderMediaInternals {
	/** Reorders the frames before they are requested (frames are still encoded in order). */
	frameOrder?: (frames: number[]) => number[];
}

/** Renders a composition to an H.264 MP4 file or buffer. */
export function renderMedia(options: RenderMediaOptions): Promise<RenderMediaResult> {
	return renderMediaInternal(options, {});
}

/** `renderMedia` with test hooks. */
export async function renderMediaInternal(
	options: RenderMediaOptions,
	internals: RenderMediaInternals,
): Promise<RenderMediaResult> {
	const { composition } = options;
	validateComposition(composition);
	const codec = oneOf("codec", options.codec, CODECS, "h264");
	if (codec !== "h264") {
		throw new MotioError(
			"E_UNSUPPORTED_CODEC",
			`Codec "${codec}" is not supported yet; this version of Motio encodes "h264" only.`,
			{ composition: composition.id },
		);
	}
	const imageFormat = oneOf(
		"imageFormat",
		options.imageFormat ?? composition.defaultVideoImageFormat ?? undefined,
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
	const crf = resolveCrf(options.crf);
	const preset = oneOf("x264Preset", options.x264Preset ?? undefined, X264_PRESETS, "medium");
	const pixelFormat = oneOf(
		"pixelFormat",
		options.pixelFormat ?? composition.defaultPixelFormat ?? undefined,
		PIXEL_FORMATS,
		"yuv420p",
	);
	if (pixelFormat.startsWith("yuva")) {
		throw new MotioError(
			"E_INVALID_OPTION",
			`pixelFormat "${pixelFormat}" has an alpha channel, which H.264 cannot store. Use yuv420p.`,
		);
	}
	const colorSpace = oneOf("colorSpace", options.colorSpace, COLOR_SPACES, "default");
	const scale = resolveScale(options.scale);
	const concurrency = resolveConcurrency(options.concurrency);
	const frames = resolveFrames(
		options.frameRange,
		options.everyNthFrame,
		composition.durationInFrames,
	);
	const size = scaledSize(composition.width, composition.height, scale);
	assertDimensionsFit(size.width, size.height, pixelFormat);

	const ffmpeg = resolveFfmpegPath(options.ffmpegExecutable);
	assertFfmpegSupports(await probeFfmpeg(ffmpeg), {
		encoders: ["libx264"],
		decoders: [imageFormat === "png" ? "png" : "mjpeg"],
	});

	const controller = toAbortController(options.cancelSignal, "renderMedia");
	const output = await prepareOutput(options.outputLocation, options.overwrite ?? true, ".mp4");
	let encoder: Encoder | undefined;
	let committed = false;
	const session = await openSession(options).catch(async (err: unknown) => {
		await output.discard();
		throw err;
	});
	try {
		const start = performance.now();
		let rendered = 0;
		let renderedDoneIn: number | null = null;
		let encodedDoneIn: number | null = null;
		const total = frames.length;
		const report = (encodedFrames: number) =>
			options.onProgress?.({
				renderedFrames: rendered,
				encodedFrames,
				renderedDoneIn,
				encodedDoneIn,
				stitchStage: "encoding",
				progress: (rendered + encodedFrames) / (2 * total),
			});
		const enc = Encoder.start(
			ffmpeg,
			h264Args({
				output: output.temp,
				fps: composition.fps / (options.everyNthFrame ?? 1),
				imageFormat,
				crf,
				preset,
				pixelFormat,
				colorSpace,
				frameCount: total,
			}),
			(n) => report(n),
		);
		encoder = enc;
		const onAbort = () => {
			void enc.kill();
		};
		controller.signal.addEventListener("abort", onAbort, { once: true });

		const order = internals.frameOrder ? internals.frameOrder([...frames]) : frames;
		const ascending = order.every((f, i) => i === 0 || f > (order[i - 1] as number));
		const indexOf = new Map(frames.map((f, i) => [f, i]));
		const buffer = new ReorderBuffer<Buffer>(
			total,
			(_, image) => enc.write(image),
			ascending ? Math.max(8, concurrency * 4) : Number.POSITIVE_INFINITY,
		);
		controller.signal.addEventListener("abort", () => buffer.abort(controller.signal.reason), {
			once: true,
		});
		options.onStart?.({
			frameCount: total,
			parallelEncoding: true,
			resolvedConcurrency: concurrency,
		});

		let slowestFrames: SlowFrame[];
		try {
			slowestFrames = await runPool({
				frames: order,
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
				onFrame: async ({ frame, image }) => {
					await buffer.push(indexOf.get(frame) as number, image);
					rendered++;
					if (rendered === total) renderedDoneIn = performance.now() - start;
					report(enc.encodedFrames);
				},
			});
			await buffer.done();
			await enc.finish();
		} catch (err) {
			buffer.abort(err);
			throw controller.signal.aborted ? controller.signal.reason : err;
		} finally {
			controller.signal.removeEventListener("abort", onAbort);
		}
		if (controller.signal.aborted) throw controller.signal.reason;
		encodedDoneIn = performance.now() - start;
		report(total);
		await output.commit();
		committed = true;
		const result = output.final === null ? await readFile(output.temp) : null;
		return { buffer: result, slowestFrames, contentType: "video/mp4" };
	} finally {
		await encoder?.kill();
		if (!committed || output.final === null) await output.discard();
		await session.close();
	}
}
