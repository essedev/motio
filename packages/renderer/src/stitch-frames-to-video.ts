import { readFile, rename, rm } from "node:fs/promises";
import { join, resolve as resolvePath } from "node:path";
import type { AudioCodec } from "@motiojs/audio";
import type { AudioIntent } from "@motiojs/core/protocol";
import { buildAudioSegments, mixSegments, silence, writeAudioFile } from "./audio.js";
import {
	AUDIO_EXTENSIONS,
	assertSampleRateFits,
	isAudioOnlyCodec,
	resolveAudioBitrate,
	resolveAudioCodec,
	resolveSampleRate,
} from "./audio-options.js";
import { type CancelSignal, toAbortController } from "./cancel.js";
import type { ProResProfile } from "./codecs.js";
import { MotioError } from "./errors.js";
import {
	assertFfmpegSupports,
	Encoder,
	gifEncodeArgs,
	gifPaletteArgs,
	probeFfmpeg,
	resolveFfmpegPath,
	resolveFfprobePath,
	runFfmpeg,
	videoArgs,
} from "./ffmpeg.js";
import { startMediaServer } from "./media-server.js";
import {
	CODECS,
	type Codec,
	type ColorSpace,
	oneOf,
	type PixelFormat,
	type X264Preset,
} from "./options.js";
import { checkOverwrite, prepareOutput } from "./output.js";
import type { RenderAssetInfo } from "./render-frames.js";
import { planVideo, videoCodecNeeds } from "./render-media.js";
import type { VideoConfig } from "./session.js";

/** Options of `stitchFramesToVideo()`. */
export interface StitchFramesToVideoOptions {
	/** Frame rate of the output. */
	fps: number;
	/** Width of the frames in pixels. */
	width: number;
	/** Height of the frames in pixels. */
	height: number;
	/** The `assetsInfo` returned by `renderFrames()`, which must have written its images to disk. */
	assetsInfo: RenderAssetInfo;
	/** Output file; null or unset returns the video as a buffer. */
	outputLocation?: string | null;
	/** Overwrite an existing `outputLocation`. Default true. */
	force?: boolean;
	/** Default `yuv420p` (see `renderMedia()`). */
	pixelFormat?: PixelFormat;
	/** A video codec of `renderMedia()`. Default `h264`. */
	codec?: Codec;
	/** Audio codec; the default depends on `codec`. */
	audioCodec?: AudioCodec | null;
	/** Audio bitrate in FFmpeg `-b:a` syntax. Default `"320k"`. */
	audioBitrate?: string | null;
	/** Constant rate factor; range and default depend on the codec (see `renderMedia()`). */
	crf?: number | null;
	/** ProRes profile, only with `prores`. Default `hq`. */
	proResProfile?: ProResProfile | null;
	/** `prores_ks` bits per macroblock, 128 to 8192, only with `prores`. */
	proResBitsPerMacroblock?: number | null;
	/** Called with the number of frames encoded so far. */
	onProgress?: (frameNumber: number) => void;
	/** Accepted for compatibility; FFmpeg reads remote audio directly, so it is never called. */
	onDownload?: (src: string) => void;
	/** GIF loops: null (the default) loops forever, 0 plays once, n repeats n times. */
	numberOfGifLoops?: number | null;
	/** Encode no audio. Default false. */
	muted?: boolean;
	/** Only `"disable"` (the default): Motio encodes in software. */
	hardwareAcceleration?: "disable" | "if-possible" | "required";
	/** Accepted for compatibility; FFmpeg errors are reported in the thrown error. */
	verbose?: boolean;
	cancelSignal?: CancelSignal;
	/** Write a silent audio track when the frames play no audio. Default false. */
	enforceAudioTrack?: boolean;
	/** Directory holding the `ffmpeg` and `ffprobe` executables; default the system FFmpeg. */
	binariesDirectory?: string | null;
	/** Write the audio to this file instead of muxing it into the video. */
	separateAudioTo?: string | null;
	/** Not supported yet; `true` fails with `E_INVALID_OPTION`. */
	forSeamlessAacConcatenation?: boolean;
	/** Output sample rate in Hz. Default 48000. */
	sampleRate?: number | null;
	/** Default `medium`. Applies to `h264`, `h264-mkv` and `h264-ts`. */
	x264Preset?: X264Preset | null;
	/** Default `default`, which Motio encodes as BT.709 (see `renderMedia()`). */
	colorSpace?: ColorSpace;
	/** Not supported yet: set it and the call fails with `E_INVALID_OPTION`. */
	videoBitrate?: string | null;
	/** Not supported yet: set it and the call fails with `E_INVALID_OPTION`. */
	bufferSize?: string | null;
	/** Not supported yet: set it and the call fails with `E_INVALID_OPTION`. */
	maxRate?: string | null;
	/** Not supported yet: set it and the call fails with `E_INVALID_OPTION`. */
	gopSize?: number | null;
	/** Not supported yet: set it and the call fails with `E_INVALID_OPTION`. */
	metadata?: Record<string, string> | null;
	/** Not supported yet: set it and the call fails with `E_INVALID_OPTION`. */
	ffmpegOverride?:
		| ((info: { type: "pre-stitcher" | "stitcher"; args: string[] }) => string[])
		| null;
}

const UNSUPPORTED = [
	"videoBitrate",
	"bufferSize",
	"maxRate",
	"gopSize",
	"metadata",
	"ffmpegOverride",
] as const;

function binaries(directory: string | null | undefined): { ffmpeg: string; ffprobe: string } {
	if (!directory) {
		const ffmpeg = resolveFfmpegPath();
		return { ffmpeg, ffprobe: resolveFfprobePath(undefined, ffmpeg) };
	}
	const suffix = process.platform === "win32" ? ".exe" : "";
	return {
		ffmpeg: join(directory, `ffmpeg${suffix}`),
		ffprobe: join(directory, `ffprobe${suffix}`),
	};
}

/**
 * Encodes the images `renderFrames()` wrote into a video, with the audio of the frames it
 * rendered. Resolves to the video as a buffer, or to null when it was written to
 * `outputLocation`. `renderMedia()` does both steps in one call and is faster.
 */
export async function stitchFramesToVideo(
	options: StitchFramesToVideoOptions,
): Promise<Buffer | null> {
	const { assetsInfo } = options;
	for (const key of UNSUPPORTED) {
		if (options[key] !== undefined && options[key] !== null) {
			throw new MotioError("E_INVALID_OPTION", `stitchFramesToVideo: ${key} is not supported yet.`);
		}
	}
	if (options.hardwareAcceleration !== undefined && options.hardwareAcceleration !== "disable") {
		throw new MotioError(
			"E_INVALID_OPTION",
			`stitchFramesToVideo: hardwareAcceleration "${options.hardwareAcceleration}" is not supported; Motio encodes in software.`,
		);
	}
	if (options.forSeamlessAacConcatenation) {
		throw new MotioError(
			"E_INVALID_OPTION",
			"stitchFramesToVideo: forSeamlessAacConcatenation is not supported yet.",
		);
	}
	const images = assetsInfo?.imageSequence;
	if (!images) {
		throw new MotioError(
			"E_INVALID_OPTION",
			"stitchFramesToVideo needs the assetsInfo of a renderFrames() call that wrote its images to outputDir.",
		);
	}
	if (assetsInfo.frames.length === 0) {
		throw new MotioError("E_INVALID_OPTION", "stitchFramesToVideo: assetsInfo has no frames.");
	}
	const codec = oneOf("codec", options.codec, CODECS, "h264");
	if (isAudioOnlyCodec(codec)) {
		throw new MotioError(
			"E_INVALID_OPTION",
			`stitchFramesToVideo encodes images into a video; for the audio-only codec "${codec}" use renderMedia().`,
		);
	}
	const composition: VideoConfig = {
		id: "stitchFramesToVideo",
		width: options.width,
		height: options.height,
		fps: options.fps,
		durationInFrames: assetsInfo.frames.length,
		defaultProps: {},
		props: {},
		defaultCodec: null,
		defaultOutName: null,
		defaultVideoImageFormat: null,
		defaultPixelFormat: null,
		defaultProResProfile: null,
		defaultSampleRate: null,
	};
	if (
		!(Number.isInteger(options.width) && options.width > 0) ||
		!(Number.isInteger(options.height) && options.height > 0) ||
		!(Number.isFinite(options.fps) && options.fps > 0)
	) {
		throw new MotioError(
			"E_INVALID_OPTION",
			`stitchFramesToVideo: width and height must be positive integers and fps positive, got ${options.width}x${options.height} at ${options.fps} fps.`,
		);
	}
	const video = planVideo({
		composition,
		codec,
		crf: options.crf,
		imageFormat: images.imageFormat,
		pixelFormat: options.pixelFormat,
		colorSpace: options.colorSpace,
		x264Preset: options.x264Preset,
		proResProfile: options.proResProfile,
		proResBitsPerMacroblock: options.proResBitsPerMacroblock,
		numberOfGifLoops: options.numberOfGifLoops,
	});
	const isGif = codec === "gif";
	const separateAudioTo = options.separateAudioTo ? resolvePath(options.separateAudioTo) : null;
	if (separateAudioTo && (options.muted === true || isGif)) {
		throw new MotioError(
			"E_INVALID_OPTION",
			"separateAudioTo cannot be used with muted or with a codec without audio (gif).",
		);
	}
	if (isGif && (options.audioCodec || options.enforceAudioTrack)) {
		throw new MotioError(
			"E_INVALID_OPTION",
			"GIFs carry no audio: audioCodec and enforceAudioTrack cannot be used with the codec gif.",
		);
	}
	const muted = options.muted === true || isGif;
	const audioCodec = muted ? null : resolveAudioCodec(codec, options.audioCodec, false);
	const audioBitrate = resolveAudioBitrate(options.audioBitrate);
	const sampleRate = resolveSampleRate(options.sampleRate);
	if (audioCodec) assertSampleRateFits(audioCodec, sampleRate);

	const { ffmpeg, ffprobe } = binaries(options.binariesDirectory);
	const audioEncoder = audioCodec
		? { aac: "aac", mp3: "libmp3lame", "pcm-16": "pcm_s16le", opus: "libopus" }[audioCodec]
		: null;
	const needs = videoCodecNeeds(video);
	assertFfmpegSupports(await probeFfmpeg(ffmpeg), {
		encoders: [...needs.encoders, ...(audioEncoder ? [audioEncoder] : [])],
		decoders: needs.decoders,
	});
	if (separateAudioTo) await checkOverwrite(separateAudioTo, options.force ?? true);

	const imagePath = (frame: number) =>
		join(
			images.directory,
			images.pattern
				.replaceAll("[frame]", String(frame).padStart(images.padding, "0"))
				.replaceAll("[ext]", images.imageFormat),
		);
	const media = await startMediaServer({
		bundleUrl: assetsInfo.bundle.url,
		bundleDir: assetsInfo.bundle.directory,
		ffmpeg,
		ffprobe,
	});
	const controller = toAbortController(options.cancelSignal, "stitchFramesToVideo");
	const extension = video.encoding.spec.extension;
	let output: Awaited<ReturnType<typeof prepareOutput>> | null = null;
	let committed = false;
	let videoTemp = "";
	let paletteTemp = "";
	try {
		const first = await media.info(imagePath(assetsInfo.frames[0] as number));
		if (
			first.video &&
			(first.video.width !== options.width || first.video.height !== options.height)
		) {
			throw new MotioError(
				"E_INVALID_OPTION",
				`stitchFramesToVideo: the frames are ${first.video.width}x${first.video.height}, not ${options.width}x${options.height}. Pass the size renderFrames() rendered (the composition size times scale).`,
			);
		}
		output = await prepareOutput(options.outputLocation, options.force ?? true, extension);
		videoTemp = muted && !isGif ? output.temp : `${output.temp}.video${isGif ? ".nut" : extension}`;
		paletteTemp = `${output.temp}.palette.png`;

		const total = assetsInfo.frames.length;
		const enc = Encoder.start(
			ffmpeg,
			videoArgs({
				output: videoTemp,
				fps: options.fps,
				imageFormat: images.imageFormat,
				encoding: video.encoding,
				preset: video.preset,
				colorSpace: video.colorSpace,
				frameCount: total,
			}),
			(n) => options.onProgress?.(n),
		);
		const onAbort = () => {
			void enc.kill();
		};
		controller.signal.addEventListener("abort", onAbort, { once: true });
		try {
			for (const frame of assetsInfo.frames) {
				if (controller.signal.aborted) throw controller.signal.reason;
				await enc.write(await readFile(imagePath(frame)));
			}
			await enc.finish();
		} catch (err) {
			throw controller.signal.aborted ? controller.signal.reason : err;
		} finally {
			controller.signal.removeEventListener("abort", onAbort);
			await enc.kill();
		}
		if (isGif) {
			await runFfmpeg(
				ffmpeg,
				gifPaletteArgs(videoTemp, images.imageFormat, paletteTemp),
				controller.signal,
			);
			await runFfmpeg(
				ffmpeg,
				gifEncodeArgs({
					intermediate: videoTemp,
					palette: paletteTemp,
					imageFormat: images.imageFormat,
					fps: options.fps,
					loop: video.encoding.gifLoop ?? 0,
					output: output.temp,
				}),
				controller.signal,
			);
		}
		if (controller.signal.aborted) throw controller.signal.reason;

		if (!muted && audioCodec) {
			const intents = new Map<number, AudioIntent[]>(
				assetsInfo.audio.map((entry) => [entry.frame, entry.intents]),
			);
			const audioFrames = assetsInfo.audioFrames;
			let mixed =
				audioFrames.length === 0
					? null
					: await mixSegments({
							segments: buildAudioSegments(audioFrames, intents),
							media,
							fps: assetsInfo.fps,
							durationInFrames: audioFrames.length,
							sampleRate,
							ffmpeg,
							ffprobe,
							signal: controller.signal,
						});
			if (controller.signal.aborted) throw controller.signal.reason;
			if (!mixed && (options.enforceAudioTrack || separateAudioTo)) {
				mixed = silence(options.fps, total, sampleRate);
			}
			const encode = {
				codec: audioCodec,
				bitrate: audioBitrate,
				ffmpeg,
				signal: controller.signal,
			};
			if (separateAudioTo && mixed) {
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
		}
		await output.commit();
		committed = true;
		return output.final === null ? await readFile(output.temp) : null;
	} finally {
		if (output) {
			if (videoTemp !== output.temp) await rm(videoTemp, { force: true });
			await rm(paletteTemp, { force: true });
			if (!committed || output.final === null) await output.discard();
		}
		await media.close();
	}
}
