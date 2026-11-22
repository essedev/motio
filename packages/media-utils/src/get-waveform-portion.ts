import type { MediaUtilsAudioData } from "./types.js";

/** One bar of `getWaveformPortion()`. */
export interface Bar {
	/** Position from 0, usable as a React key. */
	index: number;
	/** 0..1, or -1..1 with `outputRange: "minus-one-to-one"`. */
	amplitude: number;
}

/** Range of the bars: magnitudes, or magnitudes with alternating signs. */
export type WaveformOutputRange = "zero-to-one" | "minus-one-to-one";

/** Options of `getWaveformPortion()`. */
export interface GetWaveformPortionOptions {
	audioData: MediaUtilsAudioData;
	startTimeInSeconds: number;
	durationInSeconds: number;
	/** Number of bars the portion is compressed to. */
	numberOfSamples: number;
	/** Default 0. */
	channel?: number;
	/** Default `"zero-to-one"`. */
	outputRange?: WaveformOutputRange;
	/** The `dataOffsetInSeconds` returned by `useWindowedAudioData()`. */
	dataOffsetInSeconds?: number;
	/** Scale so that the largest bar is 1. Default true. */
	normalize?: boolean;
}

/** Throws the compatible error for a channel index outside the audio. */
export function validateChannel(audioData: MediaUtilsAudioData, channel: number): Float32Array {
	if (channel < 0) throw new TypeError('"channel" cannot be negative');
	const waveform = audioData.channelWaveforms[channel];
	if (channel >= audioData.numberOfChannels || waveform === undefined) {
		throw new TypeError(
			`"channel" must be ${audioData.numberOfChannels - 1} or lower. The audio has ${audioData.numberOfChannels} channels`,
		);
	}
	return waveform;
}

/** The amplitudes of `getWaveformPortion()` without the `Bar` wrapping. */
export function waveformAmplitudes(options: GetWaveformPortionOptions): number[] {
	const {
		audioData,
		startTimeInSeconds,
		durationInSeconds,
		numberOfSamples,
		channel = 0,
		outputRange = "zero-to-one",
		dataOffsetInSeconds = 0,
		normalize = true,
	} = options;
	const waveform = validateChannel(audioData, channel);
	const { sampleRate } = audioData;
	const start = startTimeInSeconds - dataOffsetInSeconds;
	const startSample = Math.floor(start * sampleRate);
	const endSample = Math.floor((start + durationInSeconds) * sampleRate);
	const perBar = Math.floor((endSample - startSample) / numberOfSamples);
	if (!(perBar >= 1)) return [];
	const values: number[] = [];
	for (let bar = 0; bar < numberOfSamples; bar++) {
		const from = startSample + bar * perBar;
		let sum = 0;
		for (let i = from; i < from + perBar; i++) {
			// Samples outside the data count as silence.
			const sample = waveform[i];
			if (sample !== undefined) sum += Math.abs(sample);
		}
		values.push(sum / perBar);
	}
	if (normalize) {
		let max = 0;
		for (const v of values) if (v > max) max = v;
		if (max !== 0) {
			const factor = 1 / max;
			for (let i = 0; i < values.length; i++) values[i] = (values[i] ?? 0) * factor;
		}
	}
	if (outputRange === "minus-one-to-one") {
		for (let i = 0; i < values.length; i += 2) values[i] = -(values[i] ?? 0);
	}
	return values;
}

/**
 * Compresses a time range of the waveform into `numberOfSamples` bars, each the mean absolute
 * sample value of its slice. With `outputRange: "minus-one-to-one"` every other bar is negated,
 * starting with the first.
 */
export function getWaveformPortion(options: GetWaveformPortionOptions): Bar[] {
	return waveformAmplitudes(options).map((amplitude, index) => ({ index, amplitude }));
}
