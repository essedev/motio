import { readFile, rename, rm } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import type { AudioIntent } from "@motiojs/core/protocol";
import { buildAudioSegments, mixSegments, silence, writeAudioFile } from "./audio.js";
import {
	AUDIO_EXTENSIONS,
	isAudioOnlyCodec,
	resolveAudioBitrate,
	resolveAudioCodec,
	resolveSampleRate,
} from "./audio-options.js";
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
import { checkOverwrite, prepareOutput } from "./output.js";
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
	/**
	 * `h264` (MP4), or `mp3`, `aac` and `wav` for audio only; other Remotion codecs fail with
	 * `E_UNSUPPORTED_CODEC`.
	 */
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
	/** Render no audio. Not allowed with an audio-only codec. Default false. */
	muted?: boolean;
	/** Audio codec; the default depends on `codec` (`aac` for h264, D-030). */
	audioCodec?: "pcm-16" | "aac" | "mp3" | "opus" | null;
	/** Audio bitrate in FFmpeg `-b:a` syntax, such as `"128k"`. Default `"320k"`. */
	audioBitrate?: string | null;
	/** Use a lossless audio codec when `codec` supports one. `audioCodec` takes priority. */
	preferLossless?: boolean;
	/** Write a silent audio track when the composition plays no audio. Default false. */
	enforceAudioTrack?: boolean;
	/** Write the audio to this file instead of muxing it into the video. */
	separateAudioTo?: string | null;
	/** Output sample rate in Hz. Default 48000. */
	sampleRate?: number | null;
	/** Not supported yet; `true` fails with `E_INVALID_OPTION`. */
	forSeamlessAacConcatenation?: boolean;
	cancelSignal?: CancelSignal;
	onStart?: (data: OnStartData) => void;
	onProgress?: (progress: RenderMediaProgress) => void;
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
	const audioOnly = isAudioOnlyCodec(codec);
	if (codec !== "h264" && !audioOnly) {
		throw new MotioError(
			"E_UNSUPPORTED_CODEC",
			`Codec "${codec}" is not supported yet; Motio renders "h264" video and "mp3", "aac" or "wav" audio.`,
			{ composition: composition.id },
		);
	}
	const muted = options.muted === true;
	if (muted && audioOnly) {
		throw new MotioError(
			"E_INVALID_OPTION",
			`muted cannot be used with the audio-only codec "${codec}".`,
			{ composition: composition.id },
		);
	}
	if (options.forSeamlessAacConcatenation) {
		throw new MotioError(
			"E_INVALID_OPTION",
			"forSeamlessAacConcatenation is not supported yet; distributed renders mux the audio rendered once.",
		);
	}
	const audioCodec = resolveAudioCodec(codec, options.audioCodec, options.preferLossless === true);
	const audioBitrate = resolveAudioBitrate(options.audioBitrate);
	const sampleRate = resolveSampleRate(options.sampleRate ?? composition.defaultSampleRate);
	const separateAudioTo = options.separateAudioTo ? resolvePath(options.separateAudioTo) : null;
	if (separateAudioTo && (audioOnly || muted)) {
		throw new MotioError(
			"E_INVALID_OPTION",
			"separateAudioTo cannot be used with an audio-only codec or with muted.",
		);
	}
	const imageFormat = oneOf(
		"imageFormat",
		options.imageFormat ?? composition.defaultVideoImageFormat ?? undefined,
		["jpeg", "png", "none"] as const,
		"jpeg",
	);
	if (imageFormat === "none" && !audioOnly) {
		throw new MotioError(
			"E_INVALID_OPTION",
			'imageFormat "none" renders audio only: use the codec "mp3", "aac" or "wav".',
		);
	}
	const captureFormat = imageFormat === "none" ? "jpeg" : imageFormat;
	const quality = resolveJpegQuality(captureFormat, options.jpegQuality);
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
	const frames = audioOnly
		? []
		: resolveFrames(options.frameRange, options.everyNthFrame, composition.durationInFrames);
	// The audio covers every frame of the range, also those `everyNthFrame` skips.
	const audioFrames = resolveFrames(options.frameRange, 1, composition.durationInFrames);
	const size = scaledSize(composition.width, composition.height, scale);
	if (!audioOnly) assertDimensionsFit(size.width, size.height, pixelFormat);

	const ffmpeg = resolveFfmpegPath(options.ffmpegExecutable);
	const audioEncoder = { aac: "aac", mp3: "libmp3lame", "pcm-16": "pcm_s16le", opus: "libopus" }[
		audioCodec
	];
	assertFfmpegSupports(await probeFfmpeg(ffmpeg), {
		encoders: [...(audioOnly ? [] : ["libx264"]), ...(muted ? [] : [audioEncoder])],
		decoders: audioOnly ? [] : [captureFormat === "png" ? "png" : "mjpeg"],
	});
	if (separateAudioTo) await checkOverwrite(separateAudioTo, options.overwrite ?? true);

	const controller = toAbortController(options.cancelSignal, "renderMedia");
	const extension = audioOnly ? AUDIO_EXTENSIONS[audioCodec] : ".mp4";
	const output = await prepareOutput(options.outputLocation, options.overwrite ?? true, extension);
	const videoTemp = muted ? output.temp : `${output.temp}.video.mp4`;
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
		const units = Math.max(1, 2 * total + (muted ? 0 : 1));
		let audioDone = false;
		const report = (encodedFrames: number, stage: "encoding" | "muxing" = "encoding") =>
			options.onProgress?.({
				renderedFrames: rendered,
				encodedFrames,
				renderedDoneIn,
				encodedDoneIn,
				stitchStage: stage,
				progress: Math.min(1, (rendered + encodedFrames + (audioDone ? 1 : 0)) / units),
			});
		const openPage = compositionPageFactory(session, composition, {
			width: composition.width,
			height: composition.height,
			scale,
			transparent: captureFormat === "png",
		});
		const intents = new Map<number, AudioIntent[]>();
		options.onStart?.({
			frameCount: audioOnly ? audioFrames.length : total,
			parallelEncoding: true,
			resolvedConcurrency: concurrency,
		});

		let slowestFrames: SlowFrame[] = [];
		if (!audioOnly) {
			const enc = Encoder.start(
				ffmpeg,
				h264Args({
					output: videoTemp,
					fps: composition.fps / (options.everyNthFrame ?? 1),
					imageFormat: captureFormat,
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
			try {
				slowestFrames = await runPool({
					frames: order,
					concurrency,
					openPage,
					format: captureFormat,
					quality,
					recycleEveryNFrames: options.recycleEveryNFrames ?? DEFAULT_RECYCLE_EVERY_N_FRAMES,
					crashRetries: DEFAULT_CRASH_RETRIES,
					signal: controller.signal,
					onFrame: async ({ frame, image, report: frameReport }) => {
						if (!muted) intents.set(frame, frameReport.audio);
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
		}

		if (!muted) {
			// The audio pass (D-030): frames the capture did not visit are seeked without capturing,
			// so frameRange, everyNthFrame and audio-only codecs cannot drop audio.
			const missing = audioFrames.filter((f) => !intents.has(f));
			if (missing.length > 0) {
				try {
					await runPool({
						frames: missing,
						concurrency,
						openPage,
						format: "jpeg",
						quality,
						capture: false,
						recycleEveryNFrames: options.recycleEveryNFrames ?? DEFAULT_RECYCLE_EVERY_N_FRAMES,
						crashRetries: DEFAULT_CRASH_RETRIES,
						signal: controller.signal,
						onFrame: async ({ frame, report: frameReport }) => {
							intents.set(frame, frameReport.audio);
						},
					});
				} catch (err) {
					throw controller.signal.aborted ? controller.signal.reason : err;
				}
				if (controller.signal.aborted) throw controller.signal.reason;
			}
			report(total, "muxing");
			const segments = buildAudioSegments(audioFrames, intents);
			let mixed = await mixSegments({
				segments,
				media: session.media,
				fps: composition.fps,
				durationInFrames: audioFrames.length,
				sampleRate,
				ffmpeg: session.ffmpeg,
				ffprobe: session.ffprobe,
			});
			if (!mixed && (audioOnly || options.enforceAudioTrack || separateAudioTo)) {
				mixed = silence(composition.fps, audioFrames.length, sampleRate);
			}
			if (controller.signal.aborted) throw controller.signal.reason;
			const encode = { codec: audioCodec, bitrate: audioBitrate, ffmpeg: session.ffmpeg };
			if (audioOnly) {
				await writeAudioFile(mixed as NonNullable<typeof mixed>, {
					...encode,
					output: output.temp,
				});
			} else if (separateAudioTo && mixed) {
				const part = `${separateAudioTo}.${process.pid}.part${AUDIO_EXTENSIONS[audioCodec]}`;
				try {
					await writeAudioFile(mixed, { ...encode, output: part });
					await rename(part, separateAudioTo);
				} finally {
					await rm(part, { force: true });
				}
				await rename(videoTemp, output.temp);
			} else if (mixed) {
				await writeAudioFile(mixed, { ...encode, output: output.temp, video: videoTemp });
			} else {
				await rename(videoTemp, output.temp);
			}
			if (audioOnly) encodedDoneIn = performance.now() - start;
			audioDone = true;
			report(total, "muxing");
		}
		await output.commit();
		committed = true;
		const result = output.final === null ? await readFile(output.temp) : null;
		return {
			buffer: result,
			slowestFrames,
			contentType: audioOnly ? (AUDIO_CONTENT_TYPES[audioCodec] ?? "audio/wav") : "video/mp4",
		};
	} finally {
		await encoder?.kill();
		if (videoTemp !== output.temp) await rm(videoTemp, { force: true });
		if (!committed || output.final === null) await output.discard();
		await session.close();
	}
}

const AUDIO_CONTENT_TYPES: Record<string, string> = {
	aac: "audio/aac",
	mp3: "audio/mpeg",
	"pcm-16": "audio/wav",
	opus: "audio/ogg",
};
