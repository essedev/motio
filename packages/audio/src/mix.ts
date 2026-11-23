import { decodeToFloat, probeChannels } from "./decode.js";
import { AudioError } from "./errors.js";
import { sourceFilter } from "./filters.js";

/** One audio source on the timeline, as collected by the audio pass. */
export interface MixSource {
	/** File path or URL FFmpeg can read. */
	src: string;
	/** Absolute composition frame where the source starts playing. */
	startFrame: number;
	/** Source offset at the start, in composition frames (`trimBefore`). */
	trimBeforeFrames: number;
	/** Number of composition frames the source plays for, from `startFrame`. */
	durationInFrames: number;
	/** Tempo factor with pitch preserved. Default 1. */
	playbackRate?: number;
	/** Pitch factor. Default 1. */
	toneFrequency?: number;
	/**
	 * Volume: a constant, or one value per composition frame starting at `startFrame` (index 0 is
	 * the first frame the source plays). Frames past the end of the array keep the last value.
	 */
	volume: number | readonly number[];
	muted?: boolean;
}

export interface MixOptions {
	sources: readonly MixSource[];
	fps: number;
	durationInFrames: number;
	/** Default 48000. */
	sampleRate?: number;
	/** Default 2. */
	channels?: number;
	/** FFmpeg executable. Default "ffmpeg". */
	ffmpeg?: string;
	/** FFprobe executable. Default "ffprobe". */
	ffprobe?: string;
}

/** Interleaved float samples of the whole timeline. */
export interface MixedAudio {
	samples: Float32Array;
	sampleRate: number;
	channels: number;
}

function volumeAt(volume: number | readonly number[], frame: number): number {
	if (typeof volume === "number") return volume;
	if (volume.length === 0) return 1;
	return volume[Math.min(frame, volume.length - 1)] ?? 1;
}

/**
 * Mixes every source onto one timeline. Offsets are sample-accurate (`startFrame / fps`),
 * volume envelopes are applied per composition frame, on time (see D-014), and the sum is left unclipped as float;
 * clipping happens only when encoding to an integer format.
 */
export async function mixAudio(options: MixOptions): Promise<MixedAudio> {
	const { sources, fps, durationInFrames } = options;
	const sampleRate = options.sampleRate ?? 48000;
	const channels = options.channels ?? 2;
	const ffmpeg = options.ffmpeg ?? "ffmpeg";
	const ffprobe = options.ffprobe ?? "ffprobe";
	if (!(fps > 0) || !Number.isInteger(durationInFrames) || durationInFrames < 0) {
		throw new RangeError(`invalid timeline: fps ${fps}, durationInFrames ${durationInFrames}`);
	}
	const totalSamples = Math.round((durationInFrames / fps) * sampleRate);
	const out = new Float32Array(totalSamples * channels);

	await Promise.all(
		sources.map(async (source) => {
			if (source.muted) return;
			if (source.startFrame < 0 || source.trimBeforeFrames < 0 || source.durationInFrames < 0) {
				throw new AudioError(
					"E_AUDIO_INVALID_SOURCE",
					"startFrame, trimBeforeFrames and durationInFrames must not be negative",
					{ src: source.src },
				);
			}
			const filter = sourceFilter({
				trimSeconds: source.trimBeforeFrames / fps,
				playbackRate: source.playbackRate ?? 1,
				toneFrequency: source.toneFrequency ?? 1,
				sampleRate,
			});
			// Fails with a clear error when the file has no audio stream.
			await probeChannels(ffprobe, source.src);
			const decoded = await decodeToFloat({
				ffmpeg,
				src: source.src,
				filter,
				sampleRate,
				channels,
			});
			const offset = Math.round((source.startFrame / fps) * sampleRate);
			const endFrame = Math.min(durationInFrames, source.startFrame + source.durationInFrames);
			const end = Math.min(totalSamples, Math.round((endFrame / fps) * sampleRate));
			const frames = decoded.length / channels;
			for (let i = offset; i < end; i++) {
				const s = i - offset;
				if (s >= frames) break;
				const frame = Math.floor(((i - offset) * fps) / sampleRate);
				const gain = volumeAt(source.volume, frame);
				if (gain === 0) continue;
				for (let c = 0; c < channels; c++) {
					const k = i * channels + c;
					out[k] = (out[k] ?? 0) + (decoded[s * channels + c] ?? 0) * gain;
				}
			}
		}),
	);
	return { samples: out, sampleRate, channels };
}
