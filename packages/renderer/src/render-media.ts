import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import type { AudioCodec } from "@motiojs/audio";
import type { AudioIntent } from "@motiojs/core/protocol";
import { silence, writeAudioFile } from "./audio.js";
import {
	AUDIO_EXTENSIONS,
	assertSampleRateFits,
	isAudioOnlyCodec,
	resolveAudioBitrate,
	resolveAudioCodec,
	resolveSampleRate,
} from "./audio-options.js";
import { type CancelSignal, toAbortController } from "./cancel.js";
import { captureVideo, mixTimelineAudio } from "./capture-video.js";
import {
	isVideoCodec,
	type ProResProfile,
	type ResolvedVideoEncoding,
	resolveVideoEncoding,
	VIDEO_CODEC_SPECS,
} from "./codecs.js";
import { MotioError } from "./errors.js";
import {
	assertFfmpegSupports,
	chooseVideoEncoder,
	gifEncodeArgs,
	gifPaletteArgs,
	probeFfmpeg,
	runFfmpeg,
	videoArgs,
} from "./ffmpeg.js";
import { resolveRenderFfmpeg } from "./ffmpeg-resolve.js";
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
	resolveFrames,
	resolveJpegQuality,
	resolveScale,
	resolveTimeModel,
	scaledSize,
	X264_PRESETS,
	type X264Preset,
} from "./options.js";
import { checkOverwrite, prepareOutput } from "./output.js";
import { resolveOutputContainer } from "./output-container.js";
import { compositionPageFactory } from "./page-factory.js";
import { defaultRecycleEveryNFrames, type SlowFrame } from "./pool.js";
import type { OnStartData } from "./render-frames.js";
import {
	type BrowserSessionOptions,
	openSession,
	type VideoConfig,
	validateComposition,
} from "./session.js";
import type { RenderWarning } from "./warnings.js";

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

/** The `onProgress` callback of `renderMedia()`. */
export type RenderMediaOnProgress = (progress: RenderMediaProgress) => void;

/** Options of `renderMedia()`. */
export interface RenderMediaOptions extends BrowserSessionOptions {
	composition: VideoConfig;
	/**
	 * `h264` (MP4), `h264-mkv`, `h264-ts`, `h265`, `vp8`, `vp9` (WebM), `av1` (MP4), `prores`
	 * (MOV), `gif`, or `mp3`, `aac` and `wav` for audio only.
	 */
	codec: Codec;
	/** Output file; null or unset returns the video as a buffer. */
	outputLocation?: string | null;
	/** Default true. */
	overwrite?: boolean;
	/**
	 * Constant rate factor; range and default depend on the codec (h264 1 to 51, default 18;
	 * h265 0 to 51, 23; vp8 4 to 63, 9; vp9 0 to 63, 28 and av1 0 to 63, 30, where 0 is
	 * lossless). Not allowed with
	 * `prores` and `gif`.
	 */
	crf?: number | null;
	/** Default `jpeg`. Transparent output needs `png`. */
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
	/**
	 * Default `yuv420p`; for `prores` `yuv422p10le`, or `yuv444p10le` with the 4444 profiles.
	 * `yuva420p` (vp8, vp9) and `yuva444p10le` (prores 4444) keep the alpha channel.
	 */
	pixelFormat?: PixelFormat;
	/** Default `default`, which Motio encodes as BT.709 with explicit conversion and tags. */
	colorSpace?: ColorSpace;
	/** Default `medium`. Applies to `h264`, `h264-mkv` and `h264-ts`. */
	x264Preset?: X264Preset | null;
	/** ProRes profile, only with `prores`. Default the composition's, else `hq`. */
	proResProfile?: ProResProfile | null;
	/** `prores_ks` bits per macroblock, 128 to 8192, only with `prores`. */
	proResBitsPerMacroblock?: number | null;
	/**
	 * GIF loops: null (the default) loops forever, 0 plays once, n repeats n times. Ignored by
	 * other codecs.
	 */
	numberOfGifLoops?: number | null;
	/** Render no audio. Not allowed with an audio-only codec. Default false. */
	muted?: boolean;
	/** Audio codec; the default depends on `codec` (D-030, D-037). */
	audioCodec?: AudioCodec | null;
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
	onProgress?: RenderMediaOnProgress;
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
	/**
	 * Motio extension: warnings about the render, each once with the first frame it was seen on
	 * (see `RenderWarning`): a font that fell back, `Math.random()` in a frame, a timeline shorter
	 * than the composition, the FFmpeg on PATH used instead of the pinned one.
	 */
	warnings: RenderWarning[];
}

/** Test hooks; not part of the public API. */
export interface RenderMediaInternals {
	/** Reorders the frames before they are requested (frames are still encoded in order). */
	frameOrder?: (frames: number[]) => number[];
}

/** Options shared by every render that captures video. */
export interface VideoPlanOptions {
	composition: VideoConfig;
	codec: Codec;
	crf?: number | null | undefined;
	imageFormat?: "jpeg" | "png" | "none" | undefined;
	jpegQuality?: number | undefined;
	scale?: number | undefined;
	pixelFormat?: PixelFormat | undefined;
	colorSpace?: ColorSpace | undefined;
	x264Preset?: X264Preset | null | undefined;
	proResProfile?: ProResProfile | null | undefined;
	proResBitsPerMacroblock?: number | null | undefined;
	numberOfGifLoops?: number | null | undefined;
}

/** The validated video settings of a render. */
export interface VideoPlan {
	encoding: ResolvedVideoEncoding;
	captureFormat: "jpeg" | "png";
	quality: number;
	preset: X264Preset;
	colorSpace: ColorSpace;
	scale: number;
	size: { width: number; height: number };
}

/**
 * The FFmpeg encoders and decoders a video plan needs; the video encoder is the list of the
 * codec's alternative encoders (`chooseVideoEncoder` picks one).
 */
export function videoCodecNeeds(plan: VideoPlan): {
	encoders: Array<string | readonly string[]>;
	decoders: string[];
} {
	return {
		encoders: [plan.encoding.spec.encoders],
		decoders: [plan.captureFormat === "png" ? "png" : "mjpeg"],
	};
}

/** Validates the video options of a render (codec, image format, encoding, size). */
export function planVideo(options: VideoPlanOptions): VideoPlan {
	const { composition, codec } = options;
	if (!isVideoCodec(codec)) {
		throw new MotioError(
			"E_UNSUPPORTED_CODEC",
			`Codec "${codec}" has no video; Motio renders h264, h264-mkv, h264-ts, h265, vp8, vp9, av1, prores and gif video, and mp3, aac and wav audio.`,
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
			'imageFormat "none" renders audio only: use the codec "mp3", "aac" or "wav".',
		);
	}
	const quality = resolveJpegQuality(imageFormat, options.jpegQuality);
	const pixelFormat = options.pixelFormat ?? composition.defaultPixelFormat ?? undefined;
	const encoding = resolveVideoEncoding({
		codec,
		crf: options.crf,
		pixelFormat:
			pixelFormat === undefined
				? undefined
				: oneOf("pixelFormat", pixelFormat, PIXEL_FORMATS, "yuv420p"),
		proResProfile: options.proResProfile,
		defaultProResProfile: composition.defaultProResProfile,
		proResBitsPerMacroblock: options.proResBitsPerMacroblock,
		numberOfGifLoops: options.numberOfGifLoops,
		imageFormat,
	});
	const preset = oneOf("x264Preset", options.x264Preset ?? undefined, X264_PRESETS, "medium");
	const colorSpace = oneOf("colorSpace", options.colorSpace, COLOR_SPACES, "default");
	const scale = resolveScale(options.scale);
	const size = scaledSize(composition.width, composition.height, scale);
	if (encoding.pixelFormat) assertDimensionsFit(size.width, size.height, encoding.pixelFormat);
	return { encoding, captureFormat: imageFormat, quality, preset, colorSpace, scale, size };
}

/** Renders a composition to a video or audio file, or to a buffer. */
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
	const video = audioOnly ? null : planVideo({ ...options, codec });
	const isGif = codec === "gif";
	if (options.muted === true && audioOnly) {
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
	const separateAudioTo = options.separateAudioTo ? resolvePath(options.separateAudioTo) : null;
	if (separateAudioTo && (audioOnly || options.muted === true || isGif)) {
		throw new MotioError(
			"E_INVALID_OPTION",
			"separateAudioTo cannot be used with an audio-only codec, with muted or with a codec without audio (gif).",
		);
	}
	if (isGif && (options.audioCodec || options.enforceAudioTrack)) {
		throw new MotioError(
			"E_INVALID_OPTION",
			"GIFs carry no audio: audioCodec and enforceAudioTrack cannot be used with the codec gif.",
		);
	}
	// GIFs carry no audio, so they render none.
	const muted = options.muted === true || isGif;
	const audioCodec = muted
		? null
		: resolveAudioCodec(codec, options.audioCodec, options.preferLossless === true);
	const audioBitrate = resolveAudioBitrate(options.audioBitrate);
	const sampleRate = resolveSampleRate(options.sampleRate ?? composition.defaultSampleRate);
	if (audioCodec) assertSampleRateFits(audioCodec, sampleRate);
	const container = resolveOutputContainer(codec, audioCodec, options.outputLocation);
	if (audioOnly && options.imageFormat !== undefined && options.imageFormat !== "none") {
		resolveJpegQuality(options.imageFormat, options.jpegQuality);
	}
	const concurrency = resolveConcurrency(options.concurrency);
	const timeModel = resolveTimeModel(options.timeModel, composition);
	const everyNthFrame = options.everyNthFrame ?? 1;
	const frames = audioOnly
		? []
		: resolveFrames(options.frameRange, options.everyNthFrame, composition.durationInFrames);
	// The audio covers every frame of the range, also those `everyNthFrame` skips.
	const audioFrames = resolveFrames(options.frameRange, 1, composition.durationInFrames);

	const resolved = await resolveRenderFfmpeg(options);
	const ffmpeg = resolved.ffmpeg;
	const audioEncoder = audioCodec
		? { aac: "aac", mp3: "libmp3lame", "pcm-16": "pcm_s16le", opus: "libopus" }[audioCodec]
		: null;
	const needs = video ? videoCodecNeeds(video) : { encoders: [], decoders: [] };
	const ffmpegInfo = await probeFfmpeg(ffmpeg);
	assertFfmpegSupports(ffmpegInfo, {
		encoders: [...needs.encoders, ...(audioEncoder ? [audioEncoder] : [])],
		decoders: needs.decoders,
	});
	const videoEncoder = video ? await chooseVideoEncoder(ffmpegInfo, video.encoding) : undefined;
	if (separateAudioTo) {
		await checkOverwrite(separateAudioTo, options.overwrite ?? true);
		// Created like the directory of the output location.
		await mkdir(dirname(separateAudioTo), { recursive: true });
	}

	const controller = toAbortController(options.cancelSignal, "renderMedia");
	const { extension, muxer } = container;
	const output = await prepareOutput(options.outputLocation, options.overwrite ?? true, extension);
	// Video first goes to its own file when audio is muxed afterwards, or when a GIF needs its
	// palette passes.
	const videoTemp =
		muted && !isGif ? output.temp : `${output.temp}.video${isGif ? ".nut" : extension}`;
	const paletteTemp = `${output.temp}.palette.png`;
	let committed = false;
	const session = await openSession({
		...options,
		ffmpegExecutable: resolved.ffmpeg,
		ffprobeExecutable: resolved.ffprobe,
	}).catch(async (err: unknown) => {
		await output.discard();
		throw err;
	});
	if (resolved.fallback) {
		session.warnings.add([{ code: "W_FFMPEG_FALLBACK", message: resolved.fallback.message }]);
	}
	try {
		const start = performance.now();
		let rendered = 0;
		let renderedDoneIn: number | null = null;
		let encodedDoneIn: number | null = null;
		const total = frames.length;
		// One unit per rendered frame, per encoded frame and for the audio. A GIF is encoded in two
		// passes after the capture (palette, then the GIF), each counted per frame; the copy to the
		// intermediate file runs alongside the capture and is not counted.
		const units = Math.max(1, (isGif ? 3 : 2) * total + (muted ? 0 : 1));
		let audioDone = false;
		// Frames through the GIF palette and encode passes, 0 to 2 * total.
		let gifFrames = 0;
		const report = (encodedFrames: number, stage: "encoding" | "muxing" = "encoding") =>
			options.onProgress?.({
				renderedFrames: rendered,
				encodedFrames,
				renderedDoneIn,
				encodedDoneIn,
				stitchStage: stage,
				progress: Math.min(
					1,
					(rendered + (isGif ? gifFrames : encodedFrames) + (audioDone ? 1 : 0)) / units,
				),
			});
		const openPage = compositionPageFactory(session, composition, {
			width: composition.width,
			height: composition.height,
			scale: video?.scale ?? 1,
			transparent: video?.captureFormat === "png",
			concurrency,
			timeModel,
		});
		const recycleEveryNFrames =
			options.recycleEveryNFrames ?? defaultRecycleEveryNFrames(timeModel);
		const intents = new Map<number, AudioIntent[]>();
		options.onStart?.({
			frameCount: audioOnly ? audioFrames.length : total,
			parallelEncoding: true,
			resolvedConcurrency: concurrency,
		});

		let slowestFrames: SlowFrame[] = [];
		if (video) {
			const fps = composition.fps / everyNthFrame;
			const captured = await captureVideo({
				ffmpeg,
				encoderArgs: videoArgs({
					output: videoTemp,
					fps,
					imageFormat: video.captureFormat,
					encoding: video.encoding,
					preset: video.preset,
					colorSpace: video.colorSpace,
					frameCount: total,
					...(videoEncoder ? { encoder: videoEncoder } : {}),
					...(muxer ? { muxer } : {}),
				}),
				frames,
				...(internals.frameOrder ? { order: internals.frameOrder([...frames]) } : {}),
				openPage,
				format: video.captureFormat,
				quality: video.quality,
				concurrency,
				recycleEveryNFrames,
				signal: controller.signal,
				onReport: (frame, frameReport) => {
					if (!muted) intents.set(frame, frameReport.audio);
				},
				onProgress: (r, encoded) => {
					rendered = r;
					// The GIF's frames are encoded by the passes below, not by this copy.
					report(isGif ? 0 : encoded);
				},
			});
			slowestFrames = captured.slowestFrames;
			renderedDoneIn = captured.renderedDoneIn;
			if (isGif) {
				report(0);
				await runFfmpeg(
					ffmpeg,
					gifPaletteArgs(video.captureFormat, paletteTemp),
					controller.signal,
					{
						stdinFile: {
							path: videoTemp,
							onRead: (fraction) => {
								const seen = Math.min(total, Math.floor(fraction * total));
								if (seen <= gifFrames) return;
								gifFrames = seen;
								report(0);
							},
						},
					},
				);
				gifFrames = total;
				report(0);
				await runFfmpeg(
					ffmpeg,
					gifEncodeArgs({
						intermediate: videoTemp,
						palette: paletteTemp,
						imageFormat: video.captureFormat,
						fps,
						loop: video.encoding.gifLoop ?? 0,
						output: output.temp,
					}),
					controller.signal,
					{
						onFrames: (n) => {
							const encoded = Math.min(n, total);
							gifFrames = total + encoded;
							report(encoded);
						},
					},
				);
				gifFrames = 2 * total;
				if (controller.signal.aborted) throw controller.signal.reason;
			}
			encodedDoneIn = performance.now() - start;
			report(total);
		}

		if (!muted && audioCodec) {
			report(total, "muxing");
			let mixed = await mixTimelineAudio({
				session,
				composition,
				audioFrames,
				intents,
				openPage,
				concurrency,
				recycleEveryNFrames,
				sampleRate,
				signal: controller.signal,
			});
			if (!mixed && (audioOnly || options.enforceAudioTrack || separateAudioTo)) {
				mixed = silence(composition.fps, audioFrames.length, sampleRate);
			}
			const encode = {
				codec: audioCodec,
				bitrate: audioBitrate,
				ffmpeg: session.ffmpeg,
				signal: controller.signal,
			};
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
			warnings: session.warnings.list(),
			contentType: video
				? VIDEO_CODEC_SPECS[video.encoding.codec].contentType
				: (AUDIO_CONTENT_TYPES[audioCodec as AudioCodec] ?? "audio/wav"),
		};
	} finally {
		if (videoTemp !== output.temp) await rm(videoTemp, { force: true });
		await rm(paletteTemp, { force: true });
		if (!committed || output.final === null) await output.discard();
		await session.close();
	}
}

const AUDIO_CONTENT_TYPES: Record<AudioCodec, string> = {
	aac: "audio/aac",
	mp3: "audio/mpeg",
	"pcm-16": "audio/wav",
	opus: "audio/ogg",
};
