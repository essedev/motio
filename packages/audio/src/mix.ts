import { availableParallelism } from "node:os";
import { decodeToFloat, probeSource, type SourceProbe, seeksSampleAccurately } from "./decode.js";
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
	 * Keep the pitch when `playbackRate` is not 1 (time stretch). False resamples instead, so the
	 * pitch follows the rate. Default true.
	 */
	preservePitch?: boolean;
	/** Zero-based audio stream of the file. Default 0. */
	audioStreamIndex?: number;
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
	/** FFmpeg processes running at once. Default half the CPU threads, between 1 and 8. */
	concurrency?: number;
}

/**
 * Input seeks start this many seconds before the trim, so a decoder that needs earlier packets
 * (MP3's bit reservoir, AAC's overlap) has settled by the first sample placed; the rest is trimmed
 * sample-accurately by `atrim`.
 */
const SEEK_PREROLL_SECONDS = 1;

/** Decoding runs this much past the samples a segment places, for resampler and tempo latency. */
const DURATION_MARGIN_SECONDS = 0.1;

/** Runs `task` over `items` with at most `limit` running at once; rejects on the first failure. */
async function forEachLimited<T>(
	items: readonly T[],
	limit: number,
	task: (item: T) => Promise<void>,
): Promise<void> {
	let next = 0;
	const worker = async (): Promise<void> => {
		while (next < items.length) {
			const item = items[next++] as T;
			await task(item);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
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

	const concurrency =
		options.concurrency ?? Math.max(1, Math.min(8, Math.floor(availableParallelism() / 2)));
	if (!Number.isInteger(concurrency) || concurrency < 1) {
		throw new RangeError(`concurrency must be a positive integer, got ${concurrency}`);
	}
	// One probe per source and stream, one decode per distinct trim and duration (a Loop repeats
	// the same segment).
	const probes = new Map<string, Promise<SourceProbe>>();
	const decodes = new Map<string, Promise<Float32Array>>();
	const once = <V>(cache: Map<string, Promise<V>>, key: string, run: () => Promise<V>) => {
		let p = cache.get(key);
		if (!p) {
			p = run();
			cache.set(key, p);
		}
		return p;
	};

	for (const source of sources) {
		if (source.startFrame < 0 || source.trimBeforeFrames < 0 || source.durationInFrames < 0) {
			throw new AudioError(
				"E_AUDIO_INVALID_SOURCE",
				"startFrame, trimBeforeFrames and durationInFrames must not be negative",
				{ src: source.src },
			);
		}
	}

	await forEachLimited(sources, concurrency, async (source) => {
		if (source.muted) return;
		const offset = Math.round((source.startFrame / fps) * sampleRate);
		const endFrame = Math.min(durationInFrames, source.startFrame + source.durationInFrames);
		const end = Math.min(totalSamples, Math.round((endFrame / fps) * sampleRate));
		if (end <= offset) return;
		const stream = source.audioStreamIndex ?? 0;
		// Fails with a clear error when the stream does not exist.
		const probe = await once(probes, `${stream}\n${source.src}`, () =>
			probeSource(ffprobe, source.src, stream),
		);
		const trimSeconds = source.trimBeforeFrames / fps;
		const seekSeconds =
			seeksSampleAccurately(probe.formatName) && trimSeconds > SEEK_PREROLL_SECONDS
				? Math.floor((trimSeconds - SEEK_PREROLL_SECONDS) * 1000) / 1000
				: 0;
		const filter = sourceFilter({
			trimSeconds: trimSeconds - seekSeconds,
			playbackRate: source.playbackRate ?? 1,
			toneFrequency: source.toneFrequency ?? 1,
			preservePitch: source.preservePitch ?? true,
			sampleRate,
		});
		const durationSeconds =
			Math.ceil(((end - offset) / sampleRate + DURATION_MARGIN_SECONDS) * 1000) / 1000;
		const decoded = await once(
			decodes,
			JSON.stringify([source.src, stream, seekSeconds, filter, durationSeconds]),
			() =>
				decodeToFloat({
					ffmpeg,
					stream,
					src: source.src,
					filter,
					sampleRate,
					channels,
					seekSeconds,
					durationSeconds,
				}),
		);
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
	});
	return { samples: out, sampleRate, channels };
}
