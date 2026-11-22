/**
 * One caption, compatible with Remotion's `Caption` type: a word or a cue
 * with its timing in milliseconds. `text` is whitespace sensitive (include the
 * space before each word); render it with `white-space: pre`.
 */
export type Caption = {
	/** The caption text, including leading whitespace between words. */
	text: string;
	/** Start time in milliseconds. */
	startMs: number;
	/** End time in milliseconds. */
	endMs: number;
	/** A single representative timestamp in milliseconds, or null if unknown. */
	timestampMs: number | null;
	/** Transcription confidence between 0 and 1, or null if unknown. */
	confidence: number | null;
	/** Forces a page or cue break after this caption. */
	pageBreakAfter?: boolean;
};
