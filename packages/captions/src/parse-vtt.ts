import type { Caption } from "./caption.js";
import { isBlank, splitLines } from "./lines.js";

/** Options of `parseVtt()`. */
export type ParseVttInput = {
	/** The contents of a `.vtt` file. */
	input: string;
};

/** Return value of `parseVtt()`. */
export type ParseVttOutput = {
	captions: Caption[];
};

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	lrm: "‎",
	rlm: "‏",
};

const decodeEntities = (text: string): string =>
	text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
		if (body.startsWith("#")) {
			const hex = body[1] === "x" || body[1] === "X";
			const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
			return decodeCodePoint(whole, code);
		}
		return NAMED_ENTITIES[body] ?? whole;
	});

// Fields are read with parseInt, as in Remotion, so "00:01.5" is 1005 ms.
const parseTimestamp = (timestamp: string): number => {
	const [clock = "", millis] = timestamp.split(/[,.]/);
	const fields = clock.split(":");
	if (
		millis === undefined ||
		millis === "" ||
		fields.length < 2 ||
		fields.length > 3 ||
		fields.includes("")
	) {
		throw new Error(`Invalid timestamp:${timestamp}`);
	}
	const [a = 0, b = 0, c] = fields.map((p) => Number.parseInt(p, 10));
	const seconds = c === undefined ? a * 60 + b : a * 3600 + b * 60 + c;
	return seconds * 1000 + Number.parseInt(millis, 10);
};

const isSkippedBlock = (line: string): boolean => /^(NOTE|STYLE|REGION)(\s|$)/.test(line);

const decodeCodePoint = (whole: string, code: number): string =>
	code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
		? String.fromCodePoint(code)
		: whole;

const toCaption = (timing: string, textLines: string[]): Caption => {
	const arrow = timing.indexOf("-->");
	const start = timing.slice(0, arrow).trim();
	const end = timing
		.slice(arrow + 3)
		.trim()
		.split(/\s+/)[0] as string;
	const startMs = parseTimestamp(start);
	const endMs = parseTimestamp(end);
	const text = decodeEntities(textLines.join("\n").replace(/<[^>]*>/g, "")).trim();
	return { text, startMs, endMs, timestampMs: (startMs + endMs) / 2, confidence: 1 };
};

/**
 * Parses the contents of a WebVTT (`.vtt`) file into captions, compatible with
 * Remotion's `parseVtt()`. The header, cue identifiers, cue settings and
 * `NOTE`, `STYLE` and `REGION` blocks are ignored; cue markup tags are removed
 * and character references decoded. Each cue becomes one caption with
 * `confidence: 1` and `timestampMs` at the midpoint.
 *
 * @example parseVtt({ input: "WEBVTT\n\n00:00.000 --> 00:02.500\nHello" })
 */
export const parseVtt = ({ input }: ParseVttInput): ParseVttOutput => {
	const lines = splitLines(input);
	if ((lines[0] ?? "").startsWith("WEBVTT")) lines.shift();
	const captions: Caption[] = [];
	// Between blocks, lines without a timing are cue identifiers and are
	// skipped. NOTE, STYLE and REGION blocks end at a blank line; a cue ends
	// only at an empty one, so whitespace-only lines stay in its text.
	let state: "between" | "skip" | "cue" = "between";
	let timing = "";
	let text: string[] = [];
	for (const line of lines) {
		if (state === "cue") {
			if (line === "") {
				captions.push(toCaption(timing, text));
				state = "between";
			} else {
				text.push(line);
			}
		} else if (state === "skip") {
			if (isBlank(line)) state = "between";
		} else if (isSkippedBlock(line)) {
			state = "skip";
		} else if (line.includes("-->")) {
			timing = line;
			text = [];
			state = "cue";
		}
	}
	if (state === "cue") captions.push(toCaption(timing, text));
	return { captions };
};
