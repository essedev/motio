import {
	type AudioCodec,
	encodeAudio,
	type MixedAudio,
	type MixSource,
	mixAudio,
} from "@motiojs/audio";
import type { AudioIntent } from "@motiojs/core/protocol";
import { MotioError } from "./errors.js";
import type { MediaServer } from "./media-server.js";

/** A timeline segment of one source, before its URL is resolved to a file. */
export interface AudioSegment extends Omit<MixSource, "src"> {
	/** The media URL the page reported. */
	src: string;
}

function sameNumber(a: number, b: number): boolean {
	return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * Joins the per-frame audio intents into continuous segments on the output timeline. `frames`
 * lists the composition frames of the output in order (output frame i shows composition frame
 * `frames[i]`). A segment continues while the next output frame is the next composition frame
 * and the source position advanced by exactly the playback rate; a seek, a loop restart or a
 * gap starts a new segment. Volumes are kept per frame.
 */
export function buildAudioSegments(
	frames: readonly number[],
	intents: ReadonlyMap<number, readonly AudioIntent[]>,
): AudioSegment[] {
	interface Open {
		segment: AudioSegment;
		volumes: number[];
		lastIndex: number;
		lastFrame: number;
		lastSourceFrame: number;
	}
	const done: Open[] = [];
	const open = new Map<string, Open>();
	frames.forEach((frame, index) => {
		for (const intent of intents.get(frame) ?? []) {
			const key = JSON.stringify([
				intent.src,
				intent.playbackRate,
				intent.toneFrequency,
				intent.preservePitch,
				intent.audioStreamIndex,
				intent.id,
			]);
			const current = open.get(key);
			if (
				current &&
				current.lastIndex === index - 1 &&
				current.lastFrame === frame - 1 &&
				sameNumber(intent.sourceFrame, current.lastSourceFrame + intent.playbackRate)
			) {
				current.volumes.push(intent.volume);
				current.lastIndex = index;
				current.lastFrame = frame;
				current.lastSourceFrame = intent.sourceFrame;
				continue;
			}
			const segment: AudioSegment = {
				src: intent.src,
				startFrame: index,
				trimBeforeFrames: intent.sourceFrame,
				durationInFrames: 0,
				playbackRate: intent.playbackRate,
				toneFrequency: intent.toneFrequency,
				preservePitch: intent.preservePitch,
				volume: [],
			};
			if (intent.audioStreamIndex !== null) segment.audioStreamIndex = intent.audioStreamIndex;
			const next: Open = {
				segment,
				volumes: [intent.volume],
				lastIndex: index,
				lastFrame: frame,
				lastSourceFrame: intent.sourceFrame,
			};
			if (current) done.push(current);
			open.set(key, next);
		}
	});
	done.push(...open.values());
	return done
		.map(({ segment, volumes }) => {
			const constant = volumes.every((v) => v === volumes[0]);
			return {
				...segment,
				durationInFrames: volumes.length,
				volume: constant ? (volumes[0] ?? 1) : volumes,
			};
		})
		.sort((a, b) => a.startFrame - b.startFrame || (a.src < b.src ? -1 : a.src > b.src ? 1 : 0));
}

/** Options of `mixSegments()`. */
export interface MixSegmentsOptions {
	segments: readonly AudioSegment[];
	media: MediaServer;
	fps: number;
	/** Output frames, at the composition's fps. */
	durationInFrames: number;
	sampleRate: number;
	ffmpeg: string;
	ffprobe: string;
}

/**
 * Mixes the segments (D-014). Sources without the requested audio stream are skipped: a video
 * without sound plays no audio. Returns null when nothing audible remains, so the caller can
 * omit the track.
 */
export async function mixSegments(options: MixSegmentsOptions): Promise<MixedAudio | null> {
	const sources: MixSource[] = [];
	for (const segment of options.segments) {
		const input = await options.media.resolveSource(segment.src);
		const info = await options.media.info(input);
		if (info.audioStreams <= (segment.audioStreamIndex ?? 0)) continue;
		sources.push({ ...segment, src: input });
	}
	if (sources.length === 0) return null;
	try {
		return await mixAudio({
			sources,
			fps: options.fps,
			durationInFrames: options.durationInFrames,
			sampleRate: options.sampleRate,
			ffmpeg: options.ffmpeg,
			ffprobe: options.ffprobe,
		});
	} catch (err) {
		throw new MotioError(
			"E_AUDIO_FAILED",
			`Mixing the audio failed: ${err instanceof Error ? err.message : String(err)}`,
			{},
			err,
		);
	}
}

/** Stereo silence lasting `durationInFrames` (for `enforceAudioTrack` and audio-only output). */
export function silence(fps: number, durationInFrames: number, sampleRate: number): MixedAudio {
	const frames = Math.round((durationInFrames / fps) * sampleRate);
	return { samples: new Float32Array(frames * 2), sampleRate, channels: 2 };
}

/**
 * Encodes mixed audio once to an audio file, or with `video` into a copy of that video file;
 * wraps failures as `E_AUDIO_FAILED`.
 */
export async function writeAudioFile(
	audio: MixedAudio,
	options: {
		output: string;
		codec: AudioCodec;
		bitrate: string | null;
		ffmpeg: string;
		video?: string;
	},
): Promise<void> {
	try {
		await encodeAudio(audio, {
			output: options.output,
			codec: options.codec,
			ffmpeg: options.ffmpeg,
			...(options.bitrate ? { bitrate: options.bitrate } : {}),
			...(options.video ? { video: options.video } : {}),
		});
	} catch (err) {
		throw new MotioError(
			"E_AUDIO_FAILED",
			`Encoding the audio failed: ${err instanceof Error ? err.message : String(err)}`,
			{ details: { output: options.output } },
			err,
		);
	}
}
