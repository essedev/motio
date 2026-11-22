import { isRemoteAsset } from "./is-remote.js";
import type { MediaUtilsAudioData } from "./types.js";

/** Options of `getAudioData()`. */
export interface GetAudioDataOptions {
	/** Sample rate the audio is decoded (resampled) to. Default 48000. */
	sampleRate?: number;
	/** Passed to the `fetch()` that loads the source, for example `{credentials: "include"}`. */
	requestInit?: RequestInit;
}

/** Default decoding sample rate, for deterministic results across devices. */
export const DEFAULT_SAMPLE_RATE = 48000;

const cache = new Map<string, Promise<MediaUtilsAudioData>>();

async function load(
	src: string,
	sampleRate: number,
	requestInit: RequestInit | undefined,
): Promise<MediaUtilsAudioData> {
	const response = await fetch(src, requestInit);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch audio data from ${src}: ${response.status} ${response.statusText}`,
		);
	}
	const encoded = await response.arrayBuffer();
	const context = new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate });
	// Rejects with the browser's EncodingError when the file has no decodable audio track.
	const buffer = await context.decodeAudioData(encoded);
	const channelWaveforms: Float32Array[] = [];
	for (let c = 0; c < buffer.numberOfChannels; c++) channelWaveforms.push(buffer.getChannelData(c));
	return {
		channelWaveforms,
		sampleRate,
		durationInSeconds: buffer.duration,
		numberOfChannels: buffer.numberOfChannels,
		resultId: String(Math.random()),
		isRemote: isRemoteAsset(src),
	};
}

/**
 * Fetches and decodes an audio (or video) file into per-channel waveforms. Results are cached by
 * `src` and `sampleRate` for the lifetime of the page; failed loads are not cached. Rejects when
 * the file cannot be fetched or has no audio track.
 */
export function getAudioData(
	src: string,
	options?: GetAudioDataOptions,
): Promise<MediaUtilsAudioData> {
	const sampleRate = options?.sampleRate ?? DEFAULT_SAMPLE_RATE;
	const key = `${sampleRate}|${src}`;
	const cached = cache.get(key);
	if (cached) return cached;
	const pending = load(src, sampleRate, options?.requestInit);
	cache.set(key, pending);
	pending.catch(() => {
		// A failed load is evicted so a later call can retry; the caller still gets the rejection.
		if (cache.get(key) === pending) cache.delete(key);
	});
	return pending;
}
