import { waveformAmplitudes } from "./get-waveform-portion.js";
import type { MediaUtilsAudioData } from "./types.js";

/** Options of `visualizeAudioWaveform()`. */
export interface VisualizeAudioWaveformOptions {
	audioData: MediaUtilsAudioData;
	frame: number;
	fps: number;
	/** Number of values returned. */
	numberOfSamples: number;
	/** Duration of audio shown, centred on `frame / fps`. */
	windowInSeconds: number;
	/** Default 0. */
	channel?: number;
	/** The `dataOffsetInSeconds` returned by `useWindowedAudioData()`. */
	dataOffsetInSeconds?: number;
	/** Scale so that the largest value is 1. Default false. */
	normalize?: boolean;
}

/**
 * The waveform around the current time as `numberOfSamples` values in -1..1, every other value
 * negated, suited to voice. Throws when the window holds fewer samples than `numberOfSamples`.
 */
export function visualizeAudioWaveform(options: VisualizeAudioWaveformOptions): number[] {
	const {
		audioData,
		frame,
		fps,
		numberOfSamples,
		windowInSeconds,
		channel = 0,
		dataOffsetInSeconds = 0,
		normalize = false,
	} = options;
	if (windowInSeconds * audioData.sampleRate < numberOfSamples) {
		throw new TypeError(
			`${windowInSeconds}s audiodata does not have ${numberOfSamples} bars. Increase windowInSeconds or decrease numberOfSamples`,
		);
	}
	return waveformAmplitudes({
		audioData,
		startTimeInSeconds: frame / fps - windowInSeconds / 2,
		durationInSeconds: windowInSeconds,
		numberOfSamples,
		channel,
		outputRange: "minus-one-to-one",
		dataOffsetInSeconds,
		normalize,
	});
}
