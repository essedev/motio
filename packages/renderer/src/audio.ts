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
 *
 * Intents carry no component identity (D-030), so each intent continues the open segment of the
 * same source, rate, pitch and stream whose next source position is the intent's: overlapping
 * copies of one source at different offsets stay one segment each. Copies at the same position
 * play the same samples and are told apart by their registry id (volume order).
 */
export function buildAudioSegments(
	frames: readonly number[],
	intents: ReadonlyMap<number, readonly AudioIntent[]>,
): AudioSegment[] {
	interface Open {
		segment: AudioSegment;
		id: string;
		volumes: number[];
		lastIndex: number;
		lastFrame: number;
		lastSourceFrame: number;
	}
	const done: Open[] = [];
	/** Segments that took an intent on the previous output frame, per source key. */
	let open = new Map<string, Open[]>();
	frames.forEach((frame, index) => {
		const next = new Map<string, Open[]>();
		for (const intent of intents.get(frame) ?? []) {
			const key = JSON.stringify([
				intent.src,
				intent.playbackRate,
				intent.toneFrequency,
				intent.preservePitch,
				intent.audioStreamIndex,
			]);
			const candidates = (open.get(key) ?? []).filter(
				(c) =>
					c.lastIndex === index - 1 &&
					c.lastFrame === frame - 1 &&
					sameNumber(intent.sourceFrame, c.lastSourceFrame + intent.playbackRate),
			);
			const current = candidates.find((c) => c.id === intent.id) ?? candidates[0];
			let target: Open;
			if (current) {
				current.volumes.push(intent.volume);
				current.lastIndex = index;
				current.lastFrame = frame;
				current.lastSourceFrame = intent.sourceFrame;
				current.id = intent.id;
				const list = open.get(key) ?? [];
				list.splice(list.indexOf(current), 1);
				target = current;
			} else {
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
				target = {
					segment,
					id: intent.id,
					volumes: [intent.volume],
					lastIndex: index,
					lastFrame: frame,
					lastSourceFrame: intent.sourceFrame,
				};
			}
			const list = next.get(key);
			if (list) list.push(target);
			else next.set(key, [target]);
		}
		// Segments nothing continued on this frame are finished.
		for (const list of open.values()) done.push(...list);
		open = next;
	});
	for (const list of open.values()) done.push(...list);
	return done
		.map(({ segment, volumes }) => {
			const constant = volumes.every((v) => v === volumes[0]);
			return {
				...segment,
				durationInFrames: volumes.length,
				volume: constant ? (volumes[0] ?? 1) : volumes,
			};
		})
		.sort(
			(a, b) =>
				a.startFrame - b.startFrame ||
				(a.src < b.src ? -1 : a.src > b.src ? 1 : 0) ||
				a.trimBeforeFrames - b.trimBeforeFrames ||
				volumeOrder(a.volume) - volumeOrder(b.volume),
		);
}

function volumeOrder(volume: number | readonly number[]): number {
	return typeof volume === "number" ? volume : (volume[0] ?? 0);
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
	/** Aborting stops the mixer's FFmpeg runs and rejects with the signal's reason. */
	signal?: AbortSignal;
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
			...(options.signal ? { signal: options.signal } : {}),
		});
	} catch (err) {
		if (options.signal?.aborted) throw options.signal.reason;
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
		/** Aborting stops FFmpeg and rejects with the signal's reason. */
		signal?: AbortSignal;
	},
): Promise<void> {
	try {
		await encodeAudio(audio, {
			output: options.output,
			codec: options.codec,
			ffmpeg: options.ffmpeg,
			...(options.bitrate ? { bitrate: options.bitrate } : {}),
			...(options.video ? { video: options.video } : {}),
			...(options.signal ? { signal: options.signal } : {}),
		});
	} catch (err) {
		if (options.signal?.aborted) throw options.signal.reason;
		throw new MotioError(
			"E_AUDIO_FAILED",
			`Encoding the audio failed: ${err instanceof Error ? err.message : String(err)}`,
			{ details: { output: options.output } },
			err,
		);
	}
}
