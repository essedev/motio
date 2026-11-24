import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { type AudioCodec, floatWav } from "@motiojs/audio";
import type { AudioIntent } from "@motiojs/core/protocol";
import { silence } from "./audio.js";
import {
	AUDIO_EXTENSIONS,
	assertSampleRateFits,
	resolveAudioBitrate,
	resolveAudioCodec,
	resolveSampleRate,
} from "./audio-options.js";
import { type CancelSignal, toAbortController } from "./cancel.js";
import { captureVideo, mixTimelineAudio } from "./capture-video.js";
import { MotioError } from "./errors.js";
import { assertFfmpegSupports, chooseVideoEncoder, probeFfmpeg, videoArgs } from "./ffmpeg.js";
import { resolveRenderFfmpeg } from "./ffmpeg-resolve.js";
import {
	type Codec,
	type FrameRange,
	resolveConcurrency,
	resolveFrames,
	resolveTimeModel,
} from "./options.js";
import { resolveOutputContainer } from "./output-container.js";
import { compositionPageFactory } from "./page-factory.js";
import { defaultRecycleEveryNFrames, type SlowFrame } from "./pool.js";
import { planVideo, type VideoPlanOptions, videoCodecNeeds } from "./render-media.js";
import {
	type BrowserSessionOptions,
	openSession,
	type VideoConfig,
	validateComposition,
} from "./session.js";

/** Container of the chunks of a codec (D-018, D-039). */
export interface ChunkContainer {
	muxer: string;
	/** Extension with the dot. */
	extension: string;
}

/**
 * Chunks are MPEG-TS for H.264 and H.265 (B-frame timestamps survive concatenation, D-018), WebM
 * for VP8, VP9 and AV1 and MOV for ProRes, which have no reordered frames. GIF has one palette for
 * the whole clip and cannot be chunked; audio-only codecs have no frames. Every worker of an AV1
 * render needs the same encoder (SVT-AV1 or libaom), or the chunks' stream headers differ.
 */
export function chunkContainer(codec: Codec): ChunkContainer {
	switch (codec) {
		case "h264":
		case "h264-mkv":
		case "h264-ts":
		case "h265":
			return { muxer: "mpegts", extension: ".ts" };
		case "vp8":
		case "vp9":
		case "av1":
			return { muxer: "webm", extension: ".webm" };
		case "prores":
			return { muxer: "mov", extension: ".mov" };
		default:
			throw new MotioError(
				"E_INVALID_OPTION",
				`The codec "${codec}" cannot be rendered in chunks: ${
					codec === "gif" ? "a GIF has one palette for the whole clip" : "it has no video frames"
				}. Render it on one machine with renderMedia().`,
			);
	}
}

/** Options `planChunkedRender()` validates. */
export interface ChunkedRenderPlanOptions extends VideoPlanOptions {
	muted?: boolean | undefined;
	audioCodec?: AudioCodec | null | undefined;
	audioBitrate?: string | null | undefined;
	preferLossless?: boolean | undefined;
	sampleRate?: number | null | undefined;
	everyNthFrame?: number | undefined;
	/** Write the audio to this file instead of the video (`renderMedia`'s option). */
	separateAudioTo?: string | null | undefined;
	/** The assembled file; its extension must fit the codec, and names the container. */
	outputLocation?: string | null | undefined;
}

/** What a chunked render of a codec produces, validated before any chunk renders. */
export interface ChunkedRenderPlan {
	/** Format of the chunks. */
	chunks: ChunkContainer;
	/** Extension of the assembled output, with the dot. */
	extension: string;
	/** Video codec tag the assembled output needs (`hvc1` for H.265 in MP4), or null. */
	videoTag: string | null;
	/**
	 * The audio to render once and encode during assembly (or into `separateAudioTo`, a file with
	 * `extension`), or null when muted.
	 */
	audio: { codec: AudioCodec; bitrate: string; sampleRate: number; extension: string } | null;
}

/**
 * Validates a chunked render like `renderMedia` validates a single-node render (codec, image
 * format, CRF, pixel format, ProRes profile, audio codec of the container, sample rate), so
 * workers never start on options that would fail. `everyNthFrame` is not supported in chunks.
 */
export function planChunkedRender(options: ChunkedRenderPlanOptions): ChunkedRenderPlan {
	validateComposition(options.composition);
	const chunks = chunkContainer(options.codec);
	const video = planVideo(options);
	if (options.everyNthFrame !== undefined && options.everyNthFrame !== 1) {
		throw new MotioError(
			"E_INVALID_OPTION",
			"everyNthFrame is not supported in chunked renders; render on one machine instead.",
		);
	}
	if (options.separateAudioTo && options.muted === true) {
		throw new MotioError("E_INVALID_OPTION", "separateAudioTo cannot be used with muted.");
	}
	const sampleRate = resolveSampleRate(options.sampleRate ?? options.composition.defaultSampleRate);
	let audio: ChunkedRenderPlan["audio"] = null;
	if (options.muted !== true) {
		const codec = resolveAudioCodec(
			options.codec,
			options.audioCodec,
			options.preferLossless === true,
		);
		assertSampleRateFits(codec, sampleRate);
		audio = {
			codec,
			bitrate: resolveAudioBitrate(options.audioBitrate),
			sampleRate,
			extension: AUDIO_EXTENSIONS[codec],
		};
	}
	const { extension } = resolveOutputContainer(
		options.codec,
		audio?.codec ?? null,
		options.outputLocation,
	);
	return {
		chunks,
		extension,
		videoTag:
			video.encoding.codec === "h265" && (extension === ".mp4" || extension === ".mov")
				? "hvc1"
				: null,
		audio,
	};
}

/** Options of `renderChunk()`, a Motio extension used by distributed rendering. */
export interface RenderChunkOptions extends BrowserSessionOptions, Omit<VideoPlanOptions, "codec"> {
	/** The codec of the final output; the chunk uses its encoder settings. */
	codec: Codec;
	/** Inclusive range of composition frames in this chunk. */
	frameRange: readonly [number, number];
	/** Where the video-only chunk is written (`chunkContainer(codec)` format). */
	outputLocation: string;
	/** Pages rendering this chunk in parallel. Default 1. */
	concurrency?: number | string | null;
	cancelSignal?: CancelSignal;
	onProgress?: (progress: { renderedFrames: number; encodedFrames: number }) => void;
	/** Replace each page with a fresh one after this many frames. Default 500; 0 never. */
	recycleEveryNFrames?: number;
}

/** Result of `renderChunk()`. */
export interface RenderChunkResult {
	outputLocation: string;
	frameCount: number;
	slowestFrames: SlowFrame[];
}

/**
 * Renders a contiguous frame range to a video-only chunk with the encoder settings of a full
 * render of `codec`. Each chunk is its own encode, so it starts with a keyframe and references
 * no frame outside it (closed GOP); `assembleChunks` from `@motiojs/distributed` concatenates
 * chunks without re-encoding.
 */
export async function renderChunk(options: RenderChunkOptions): Promise<RenderChunkResult> {
	const { composition } = options;
	validateComposition(composition);
	const container = chunkContainer(options.codec);
	const video = planVideo(options);
	const frames = resolveFrames(options.frameRange, 1, composition.durationInFrames);
	const concurrency = resolveConcurrency(options.concurrency ?? 1);
	const timeModel = resolveTimeModel(options.timeModel, composition);
	const resolved = await resolveRenderFfmpeg(options);
	const ffmpeg = resolved.ffmpeg;
	const ffmpegInfo = await probeFfmpeg(ffmpeg);
	assertFfmpegSupports(ffmpegInfo, videoCodecNeeds(video));
	const encoder = await chooseVideoEncoder(ffmpegInfo, video.encoding);
	const output = resolvePath(options.outputLocation);
	await mkdir(dirname(output), { recursive: true });
	const part = `${output}.${process.pid}.part${container.extension}`;
	const controller = toAbortController(options.cancelSignal, "renderChunk");
	const session = await openSession({
		...options,
		ffmpegExecutable: resolved.ffmpeg,
		ffprobeExecutable: resolved.ffprobe,
	});
	try {
		const captured = await captureVideo({
			ffmpeg,
			encoderArgs: videoArgs({
				output: part,
				fps: composition.fps,
				imageFormat: video.captureFormat,
				encoding: video.encoding,
				preset: video.preset,
				colorSpace: video.colorSpace,
				frameCount: frames.length,
				muxer: container.muxer,
				encoder,
			}),
			frames,
			openPage: compositionPageFactory(session, composition, {
				width: composition.width,
				height: composition.height,
				scale: video.scale,
				transparent: video.captureFormat === "png",
				concurrency,
				timeModel,
			}),
			format: video.captureFormat,
			quality: video.quality,
			concurrency,
			recycleEveryNFrames: options.recycleEveryNFrames ?? defaultRecycleEveryNFrames(timeModel),
			signal: controller.signal,
			onProgress: (renderedFrames, encodedFrames) =>
				options.onProgress?.({ renderedFrames, encodedFrames }),
		});
		await rename(part, output);
		return {
			outputLocation: output,
			frameCount: frames.length,
			slowestFrames: captured.slowestFrames,
		};
	} finally {
		await rm(part, { force: true });
		await session.close();
	}
}

/** Options of `renderAudio()`, a Motio extension used by distributed rendering. */
export interface RenderAudioOptions extends BrowserSessionOptions {
	composition: VideoConfig;
	frameRange?: FrameRange | null;
	/** Output sample rate in Hz. Default the composition's, else 48000. */
	sampleRate?: number | null;
	/** Write silence when the composition plays no audio. Default false. */
	enforceAudioTrack?: boolean;
	/** Where the mixed audio is written, as a 32-bit float WAV. */
	outputLocation: string;
	/** Pages seeking in parallel. Default: half the CPU threads, at most 8. */
	concurrency?: number | string | null;
	cancelSignal?: CancelSignal;
	recycleEveryNFrames?: number;
}

/** Result of `renderAudio()`. */
export interface RenderAudioResult {
	/** The WAV file, or null when nothing is audible and `enforceAudioTrack` is false. */
	outputLocation: string | null;
	sampleRate: number;
	/** Output frames the audio covers, at the composition's fps. */
	durationInFrames: number;
}

/**
 * Renders the audio of the whole timeline once (D-014, D-030) without capturing frames, as
 * lossless float samples: encoding them later gives the same bitstream as `renderMedia`, which
 * encodes the same samples.
 */
export async function renderAudio(options: RenderAudioOptions): Promise<RenderAudioResult> {
	const { composition } = options;
	validateComposition(composition);
	const audioFrames = resolveFrames(options.frameRange, 1, composition.durationInFrames);
	const sampleRate = resolveSampleRate(options.sampleRate ?? composition.defaultSampleRate);
	const concurrency = resolveConcurrency(options.concurrency);
	const timeModel = resolveTimeModel(options.timeModel, composition);
	const controller = toAbortController(options.cancelSignal, "renderAudio");
	const output = resolvePath(options.outputLocation);
	const session = await openSession(options);
	try {
		const openPage = compositionPageFactory(session, composition, {
			width: composition.width,
			height: composition.height,
			scale: 1,
			transparent: false,
			concurrency,
			timeModel,
		});
		let mixed = await mixTimelineAudio({
			session,
			composition,
			audioFrames,
			intents: new Map<number, AudioIntent[]>(),
			openPage,
			concurrency,
			recycleEveryNFrames: options.recycleEveryNFrames ?? defaultRecycleEveryNFrames(timeModel),
			sampleRate,
			signal: controller.signal,
		});
		if (!mixed && options.enforceAudioTrack) {
			mixed = silence(composition.fps, audioFrames.length, sampleRate);
		}
		if (!mixed) return { outputLocation: null, sampleRate, durationInFrames: audioFrames.length };
		await mkdir(dirname(output), { recursive: true });
		await writeFile(output, floatWav(mixed));
		return { outputLocation: output, sampleRate, durationInFrames: audioFrames.length };
	} finally {
		await session.close();
	}
}
