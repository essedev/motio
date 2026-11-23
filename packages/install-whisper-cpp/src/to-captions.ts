import type { Caption } from "@motiojs/captions";
import type { TranscriptionJson } from "./types.js";

/** Input of {@link toCaptions}. */
export interface ToCaptionsInput {
	/** The result of `transcribe()` called with `tokenLevelTimestamps: true`. */
	whisperCppOutput: TranscriptionJson<true>;
}

/** Output of {@link toCaptions}. */
export interface ToCaptionsOutput {
	captions: Caption[];
}

const describe = (value: unknown) => (value === undefined ? "missing" : JSON.stringify(value));

/**
 * Turns the output of `transcribe()` (with `tokenLevelTimestamps: true`) into captions: one per
 * item with text, skipping empty ones; the first caption's leading whitespace is removed. Times
 * come from the item's offsets, `timestampMs` from its first token's `t_dtw` (null when
 * whisper.cpp gives -1) and `confidence` from that token's probability.
 */
export function toCaptions(input: ToCaptionsInput): ToCaptionsOutput {
	const output = input.whisperCppOutput as unknown;
	if (typeof output !== "object" || output === null) {
		throw new TypeError(
			`toCaptions(): whisperCppOutput is ${describe(output)}: pass the result of transcribe().`,
		);
	}
	const transcription = (output as { transcription?: unknown }).transcription;
	if (typeof transcription !== "string" && !Array.isArray(transcription)) {
		throw new TypeError(
			`toCaptions(): whisperCppOutput.transcription is ${describe(transcription)}: pass the result of transcribe().`,
		);
	}
	const captions: Caption[] = [];
	for (const [i, item] of [...(transcription as Iterable<unknown>)].entries()) {
		const at = `whisperCppOutput.transcription[${i}]`;
		const entry = (item ?? {}) as { text?: unknown; offsets?: unknown; tokens?: unknown };
		if (entry.text === "") continue;
		const first = captions.length === 0;
		// Only the first caption's text is read as a string (to trim it), as in the published
		// function; later texts are passed on unchanged.
		if (first && typeof entry.text !== "string") {
			throw new TypeError(`toCaptions(): ${at}.text is ${describe(entry.text)}: pass a string.`);
		}
		const offsets = entry.offsets as { from: number; to: number } | undefined;
		if (typeof offsets !== "object" || offsets === null) {
			throw new TypeError(
				`toCaptions(): ${at}.offsets is ${describe(offsets)}: pass whisper.cpp's offsets.`,
			);
		}
		const token = (Array.isArray(entry.tokens) ? entry.tokens[0] : undefined) as
			| { t_dtw: number; p?: number }
			| undefined;
		if (token === undefined || token === null) {
			throw new TypeError(
				`toCaptions(): ${at} has no tokens. Call transcribe() with tokenLevelTimestamps: true.`,
			);
		}
		captions.push({
			text: first ? (entry.text as string).trimStart() : (entry.text as string),
			startMs: offsets.from,
			endMs: offsets.to,
			timestampMs: token.t_dtw === -1 ? null : token.t_dtw * 10,
			confidence: token.p as number,
		});
	}
	return { captions };
}
