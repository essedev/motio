import type { Caption } from "./caption.js";

/** Options of `serializeSrt()`. */
export type SerializeSrtInput = {
	/** One array of words per cue; words are concatenated without separators. */
	lines: Caption[][];
};

const pad = (value: number, length: number): string => String(value).padStart(length, "0");

// Each field is floored on its own, as Remotion does, so fractional
// milliseconds truncate and negative times keep a sign in every field.
const formatTimestamp = (ms: number): string => {
	const hours = Math.floor(ms / 3_600_000);
	const minutes = Math.floor((ms % 3_600_000) / 60_000);
	const seconds = Math.floor((ms % 60_000) / 1000);
	const millis = Math.floor(ms % 1000);
	return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`;
};

/**
 * Serializes captions into the SubRip (`.srt`) format, compatible with
 * Remotion's `serializeSrt()`. Each item of `lines` is one cue: its words are
 * concatenated, it starts at the first word's `startMs` and ends at the last
 * word's `endMs`. A word with `pageBreakAfter: true` ends its cue early. Empty
 * arrays are skipped.
 *
 * @example serializeSrt({ lines: captions.map((caption) => [caption]) })
 */
export const serializeSrt = ({ lines }: SerializeSrtInput): string => {
	const cues: Caption[][] = [];
	for (const line of lines) {
		let cue: Caption[] = [];
		for (const word of line) {
			cue.push(word);
			if (word.pageBreakAfter === true) {
				cues.push(cue);
				cue = [];
			}
		}
		if (cue.length > 0) cues.push(cue);
	}
	return cues
		.map((cue, i) => {
			const first = cue[0] as Caption;
			const last = cue[cue.length - 1] as Caption;
			const text = cue.map((word) => word.text).join("");
			return `${i + 1}\n${formatTimestamp(first.startMs)} --> ${formatTimestamp(last.endMs)}\n${text}`;
		})
		.join("\n\n");
};
