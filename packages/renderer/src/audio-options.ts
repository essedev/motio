import type { AudioCodec } from "@motiojs/audio";
import { MotioError } from "./errors.js";
import type { Codec } from "./options.js";

/** Values of Remotion's `audioCodec` option. */
export const AUDIO_CODECS = ["pcm-16", "aac", "mp3", "opus"] as const;

/** Codecs that produce an audio file only. */
export const AUDIO_ONLY_CODECS = ["mp3", "aac", "wav"] as const;

/** An audio-only `codec`. */
export type AudioOnlyCodec = (typeof AUDIO_ONLY_CODECS)[number];

/** Default `audioBitrate` for compressed audio, as in Remotion's server-side renders. */
export const DEFAULT_AUDIO_BITRATE = "320k";

/** Default output sample rate. */
export const DEFAULT_SAMPLE_RATE = 48_000;

/**
 * Audio codecs each output codec can carry, the default first (D-030). Only the codecs Motio
 * renders are listed.
 */
const SUPPORTED: Partial<Record<Codec, readonly AudioCodec[]>> = {
	h264: ["aac", "mp3"],
	aac: ["aac"],
	mp3: ["mp3"],
	wav: ["pcm-16"],
};

/** File extension of an audio-only output, and of the audio written by `separateAudioTo`. */
export const AUDIO_EXTENSIONS: Record<AudioCodec, string> = {
	aac: ".aac",
	mp3: ".mp3",
	"pcm-16": ".wav",
	opus: ".opus",
};

/** True for `mp3`, `aac` and `wav`, which render audio only. */
export function isAudioOnlyCodec(codec: Codec): codec is AudioOnlyCodec {
	return (AUDIO_ONLY_CODECS as readonly string[]).includes(codec);
}

/**
 * Resolves `audioCodec` for `codec`: the explicit value when the container supports it, else
 * the codec's default; `preferLossless` picks a lossless codec where one is supported.
 */
export function resolveAudioCodec(
	codec: Codec,
	audioCodec: string | null | undefined,
	preferLossless: boolean,
): AudioCodec {
	const supported = SUPPORTED[codec];
	if (!supported) {
		throw new MotioError(
			"E_UNSUPPORTED_CODEC",
			`Codec "${codec}" is not supported yet; Motio renders h264, mp3, aac and wav.`,
		);
	}
	if (audioCodec !== null && audioCodec !== undefined) {
		if (!(AUDIO_CODECS as readonly string[]).includes(audioCodec)) {
			throw new MotioError(
				"E_INVALID_OPTION",
				`audioCodec must be one of ${AUDIO_CODECS.join(", ")}, got ${JSON.stringify(audioCodec)}.`,
			);
		}
		if (!supported.includes(audioCodec as AudioCodec)) {
			throw new MotioError(
				"E_INVALID_OPTION",
				`audioCodec "${audioCodec}" cannot be used with codec "${codec}"; supported: ${supported.join(", ")}.`,
			);
		}
		return audioCodec as AudioCodec;
	}
	if (preferLossless && supported.includes("pcm-16")) return "pcm-16";
	return supported[0] as AudioCodec;
}

/** Validates `audioBitrate` (FFmpeg `-b:a` syntax such as `"128k"` or `"1M"`). */
export function resolveAudioBitrate(value: string | null | undefined): string {
	if (value === null || value === undefined) return DEFAULT_AUDIO_BITRATE;
	if (typeof value !== "string" || !/^\d+(\.\d+)?[kKmM]?$/.test(value)) {
		throw new MotioError(
			"E_INVALID_OPTION",
			`audioBitrate must be an FFmpeg bitrate such as "128k" or "1M", got ${JSON.stringify(value)}.`,
		);
	}
	return value;
}

/** Validates `sampleRate`. */
export function resolveSampleRate(value: number | null | undefined): number {
	if (value === null || value === undefined) return DEFAULT_SAMPLE_RATE;
	if (!Number.isInteger(value) || value < 8000 || value > 192_000) {
		throw new MotioError(
			"E_INVALID_OPTION",
			`sampleRate must be an integer from 8000 to 192000, got ${String(value)}.`,
		);
	}
	return value;
}
