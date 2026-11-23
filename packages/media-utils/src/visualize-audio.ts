import { fft } from "./fft.js";
import type { MediaUtilsAudioData } from "./types.js";

/** Options of `visualizeAudio()`. */
export interface VisualizeAudioOptions {
	audioData: MediaUtilsAudioData;
	/** Position in the audio, in frames. Adjust it yourself when the audio is offset or trimmed. */
	frame: number;
	fps: number;
	/** Number of frequency bands returned; a power of two. */
	numberOfSamples: number;
	/** Average the spectrum of the previous, current and next frame. Default true. */
	smoothing?: boolean;
	/**
	 * Accepted for compatibility. Both values compute the same spectrum: Remotion's two FFTs agree
	 * to within floating-point rounding, so Motio uses one.
	 */
	optimizeFor?: "accuracy" | "speed";
	/** The `dataOffsetInSeconds` returned by `useWindowedAudioData()`. */
	dataOffsetInSeconds?: number;
}

// Peak of each loaded audio, keyed by resultId: computing it scans the whole first channel.
const peaks = new Map<string, number>();

function toInt16Scale(sample: number): number {
	return sample < 0 ? sample * 32768 : sample * 32767;
}

function peakOf(audioData: MediaUtilsAudioData, waveform: Float32Array): number {
	const cached = peaks.get(audioData.resultId);
	if (cached !== undefined) return cached;
	let peak = 0;
	for (let i = 0; i < waveform.length; i++) {
		const v = Math.abs(toInt16Scale(waveform[i] as number));
		if (v > peak) peak = v;
	}
	const result = peak === 0 ? 1 : peak;
	peaks.set(audioData.resultId, result);
	return result;
}

/** One 3-tap average pass over the inner bands; the first and last band are kept. */
function smoothBands(values: number[]): number[] {
	const n = values.length;
	const out = values.slice();
	for (let i = 1; i < n - 1; i++) {
		out[i] = ((values[i - 1] as number) + (values[i] as number) + (values[i + 1] as number)) / 3;
	}
	for (let pass = 0; pass < 2; pass++) {
		for (let i = 1; i < n - 1; i++) {
			out[i] = ((out[i - 1] as number) + (out[i] as number) + (out[i + 1] as number)) / 3;
		}
	}
	return out;
}

function spectrumAt(
	waveform: Float32Array,
	peak: number,
	time: number,
	sampleRate: number,
	bands: number,
): number[] {
	const size = bands * 2;
	const start = Math.max(0, Math.floor(time * sampleRate) - bands);
	const window = new Int16Array(size);
	for (let i = 0; i < size; i++) {
		const sample = waveform[start + i];
		// Rounded to 32-bit float first (measured: Remotion's values pass through a Float32Array),
		// then the Int16Array assignment truncates and wraps, like a 16-bit PCM conversion.
		window[i] = sample === undefined ? 0 : Math.fround(toInt16Scale(sample));
	}
	const re = new Float64Array(size);
	const im = new Float64Array(size);
	for (let i = 0; i < size; i++) re[i] = (window[i] as number) / peak;
	fft(re, im);
	const magnitudes: number[] = [];
	for (let k = 0; k < bands; k++) {
		magnitudes.push(Math.sqrt((re[k] as number) ** 2 + (im[k] as number) ** 2) / bands);
	}
	return smoothBands(magnitudes);
}

/**
 * The frequency spectrum of the audio at `frame` as `numberOfSamples` values, low frequencies
 * first. Takes `2 * numberOfSamples` samples of the first channel centred on the frame, as 16-bit
 * values normalized by the channel's peak, and returns the FFT magnitudes smoothed across
 * neighbouring bands. Values are usually within 0..1, the lowest bands being much larger than
 * the highest.
 */
export function visualizeAudio(options: VisualizeAudioOptions): number[] {
	const {
		audioData,
		frame,
		fps,
		numberOfSamples,
		smoothing = true,
		dataOffsetInSeconds = 0,
	} = options;
	const size = numberOfSamples * 2;
	if (!(Number.isInteger(size) && size > 0 && (size & (size - 1)) === 0)) {
		throw new TypeError(
			`numberOfSamples is ${numberOfSamples}: use a power of two, such as 32, 64 or 128.`,
		);
	}
	const waveform = audioData.channelWaveforms[0];
	if (waveform === undefined || waveform.length < size) {
		throw new TypeError(
			`The audio has ${waveform?.length ?? 0} samples, too few for numberOfSamples ${numberOfSamples} (it needs ${size}): pass fewer samples or longer audio.`,
		);
	}
	const peak = peakOf(audioData, waveform);
	const at = (f: number) =>
		spectrumAt(
			waveform,
			peak,
			f / fps - dataOffsetInSeconds,
			audioData.sampleRate,
			numberOfSamples,
		);
	if (!smoothing) return at(frame);
	const previous = at(frame - 1);
	const current = at(frame);
	const next = at(frame + 1);
	return current.map((v, i) => ((previous[i] as number) + v + (next[i] as number)) / 3);
}
