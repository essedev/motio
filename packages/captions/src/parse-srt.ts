import type { Caption } from "./caption.js";
import { isBlank, splitLines } from "./lines.js";

/** Options of `parseSrt()`. */
export type ParseSrtInput = {
	/** The contents of a `.srt` file. */
	input: string;
	/** Reject malformed or empty files instead of skipping what is not understood. Default false. */
	strict?: boolean;
};

/** Return value of `parseSrt()`. */
export type ParseSrtOutput = {
	captions: Caption[];
};

const INDEX = /^\d+$/;
const ARROW = " --> ";

const isIndexLine = (line: string): boolean => INDEX.test(line.trim());

// Tolerant parsing (the default) mirrors the observable behaviour of
// Remotion's parser: each component is read with parseInt, so short or
// malformed fields degrade instead of failing, and the milliseconds field is
// added as an integer count ("1,5" is 1005 ms).
const parseLooseTimestamp = (raw: string): number => {
	const timestamp = raw.trim();
	const [clock = "", millis] = timestamp.split(/[,.]/);
	const parts = clock.split(":");
	if (millis === undefined || millis === "" || parts.length !== 3 || parts.includes("")) {
		throw new Error(`Invalid timestamp:${timestamp}`);
	}
	const [hours = "", minutes = "", seconds = ""] = parts;
	return (
		Number.parseInt(hours, 10) * 3_600_000 +
		Number.parseInt(minutes, 10) * 60_000 +
		Number.parseInt(seconds, 10) * 1000 +
		Number.parseInt(millis, 10)
	);
};

type Draft = { text: string; startMs: number; endMs: number };

const looseCaption = (draft: Draft): Caption => ({
	text: draft.text.trimEnd(),
	startMs: draft.startMs,
	endMs: draft.endMs,
	confidence: 1,
	timestampMs: (draft.startMs + draft.endMs) / 2,
});

const parseLoose = (input: string): Caption[] => {
	const lines = splitLines(input);
	const captions: Caption[] = [];
	let current: Draft | null = null;
	let afterBlank = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;
		const next = lines[i + 1];
		if (isIndexLine(line) && next?.includes(ARROW)) {
			if (current !== null) captions.push(looseCaption(current));
			const [start = "", end = ""] = next.split(ARROW);
			current = { text: "", startMs: parseLooseTimestamp(start), endMs: parseLooseTimestamp(end) };
			afterBlank = false;
			i++;
			continue;
		}
		if (current === null) continue;
		if (isBlank(line)) {
			current.text = current.text.trim();
			afterBlank = true;
			continue;
		}
		current.text += current.text === "" || afterBlank ? line : `\n${line}`;
		afterBlank = false;
	}
	if (current !== null) captions.push(looseCaption(current));
	return captions;
};

// Strict parsing validates every cue: a numeric index, a timing line with two
// complete HH:MM:SS,mmm timestamps (minutes and seconds below 60, end not
// before start) optionally followed by recognised settings (the WebVTT cue
// settings, or the SubRip X1/X2/Y1/Y2 coordinates), then at least one text
// line. Errors name the cue and the 1-based line.
const STRICT_TIMESTAMP = /^(\d+):(\d{2}):(\d{2})[,.](\d{3})$/;
const SETTING = /^(?:(?:align|position|line|size|vertical):\S+|[XY][12]:\d+)$/;

const parseStrictTimestamp = (timestamp: string, where: string): number => {
	const match = STRICT_TIMESTAMP.exec(timestamp);
	const minutes = Number(match?.[2]);
	const seconds = Number(match?.[3]);
	if (match === null || minutes >= 60 || seconds >= 60) {
		throw new Error(`${where}: invalid timestamp "${timestamp}". Use HH:MM:SS,mmm.`);
	}
	return Number(match[1]) * 3_600_000 + minutes * 60_000 + seconds * 1000 + Number(match[4]);
};

const parseStrict = (input: string): Caption[] => {
	const lines = splitLines(input);
	const captions: Caption[] = [];
	let i = 0;
	const skipBlank = () => {
		while (i < lines.length && isBlank(lines[i] as string)) i++;
	};
	skipBlank();
	while (i < lines.length) {
		const cue = captions.length + 1;
		const at = (index: number) => `SRT cue ${cue}, line ${index + 1}`;
		if (!isIndexLine(lines[i] as string)) {
			throw new Error(`${at(i)}: expected a numeric cue index.`);
		}
		i++;
		const timing = (lines[i] ?? "").trim();
		const tokens = timing.split(/\s+/);
		const [start = "", arrow, end = "", ...settings] = tokens;
		if (arrow !== "-->" || end === "" || !settings.every((s) => SETTING.test(s))) {
			throw new Error(`${at(i)}: expected start --> end timestamps.`);
		}
		const startMs = parseStrictTimestamp(start, at(i));
		const endMs = parseStrictTimestamp(end, at(i));
		if (endMs < startMs) {
			throw new Error(`${at(i)}: end must not be earlier than start.`);
		}
		i++;
		const text: string[] = [];
		while (i < lines.length && !isBlank(lines[i] as string)) {
			text.push(lines[i] as string);
			i++;
		}
		if (text.length === 0) {
			throw new Error(`${at(i)}: expected cue text.`);
		}
		captions.push({
			text: text.join("\n").trimEnd(),
			startMs,
			endMs,
			timestampMs: (startMs + endMs) / 2,
			confidence: 1,
		});
		skipBlank();
	}
	if (captions.length === 0) {
		throw new Error(
			"SRT: No timed captions found. Provide numbered cues with timestamps and text.",
		);
	}
	return captions;
};

/**
 * Parses the contents of a SubRip (`.srt`) file into captions, compatible
 * with Remotion's `parseSrt()`. Each cue becomes one caption with
 * `confidence: 1` and `timestampMs` at the midpoint.
 *
 * By default parsing is tolerant: cues it does not recognise are skipped.
 * With `strict: true` a malformed or empty file throws an error that names the
 * cue and the line.
 *
 * @example parseSrt({ input: "1\n00:00:00,000 --> 00:00:02,500\nHello" })
 */
export const parseSrt = ({ input, strict = false }: ParseSrtInput): ParseSrtOutput => ({
	captions: strict ? parseStrict(input) : parseLoose(input),
});
