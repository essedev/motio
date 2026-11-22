/** Decoded audio as returned by `getAudioData()` and the audio data hooks. */
export interface MediaUtilsAudioData {
	/** One array of samples per channel, in -1..1. */
	channelWaveforms: Float32Array[];
	/** Sample rate of `channelWaveforms`: the requested rate (48000 by default), not the file's. */
	sampleRate: number;
	durationInSeconds: number;
	numberOfChannels: number;
	/** Unique per load; functions use it to cache work derived from the same data. */
	resultId: string;
	/** Whether the source is outside the page's origin. */
	isRemote: boolean;
}

/** Metadata returned by `getVideoMetadata()`. */
export interface VideoMetadata {
	/** May be `Infinity` when the file does not store its duration up front. */
	durationInSeconds: number;
	width: number;
	height: number;
	/** `width / height`. */
	aspectRatio: number;
	isRemote: boolean;
}

/** Dimensions returned by `getImageDimensions()`. */
export interface ImageDimensions {
	width: number;
	height: number;
}
