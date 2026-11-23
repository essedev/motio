import type { Instruction } from "./instruction.js";

// Segmentation and number syntax follow the observable behaviour of
// Remotion's parser, which descends from svg-path-properties: a segment is a
// command letter followed by everything up to the next command letter;
// numbers are matched with the pattern below (so "+" is ignored and "1.e2"
// reads as 1 and 2); other characters are skipped. Arc arguments are
// scanned strictly instead, with the SVG number grammar and single-character
// flags, so compact forms such as "a5 5 0 1110 10" work.
const SEGMENT = /([astvzqmhlc])([^astvzqmhlc]*)/gi;
const NUMBER = /-?[0-9]*\.?[0-9]+(?:e[-+]?\d+)?/gi;
const ARC_NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const SEPARATORS = /[\s,]*/y;

const ARITY: Record<string, number> = {
	a: 7,
	c: 6,
	h: 1,
	l: 2,
	m: 2,
	q: 4,
	s: 4,
	t: 2,
	v: 1,
	z: 0,
};

const malformed = (message: string): Error => new Error(`Invalid SVG path data: ${message}`);

const arityError = (command: string, tokens: string[]): Error => {
	const arity = ARITY[command.toLowerCase()] as number;
	const segment = [command, ...tokens].join(" ");
	return malformed(
		arity === 0
			? `"${segment}": ${command} takes no numbers.`
			: `"${segment}" has ${tokens.length} numbers, but ${command} takes them in groups of ${arity}.`,
	);
};

/** Scans the arguments of an arc segment: numbers, with single-character flags. */
const scanArcTokens = (command: string, args: string): string[] => {
	const tokens: string[] = [];
	let pos = 0;
	const skipSeparators = () => {
		SEPARATORS.lastIndex = pos;
		SEPARATORS.exec(args);
		pos = SEPARATORS.lastIndex;
	};
	for (;;) {
		const slot = tokens.length % 7;
		const before = pos;
		const invalid = () =>
			malformed(
				`the arguments of the arc ${command} cannot be read from "${args.slice(before).trim()}" (flags are 0 or 1).`,
			);
		skipSeparators();
		if (pos >= args.length) break;
		if (slot === 3 || slot === 4) {
			const flag = args[pos];
			if (flag !== "0" && flag !== "1") throw invalid();
			tokens.push(flag);
			pos++;
			continue;
		}
		ARC_NUMBER.lastIndex = pos;
		const match = ARC_NUMBER.exec(args);
		if (match === null) throw invalid();
		tokens.push(match[0]);
		pos = ARC_NUMBER.lastIndex;
	}
	return tokens;
};

const build = (command: string, n: number[]): Instruction => {
	switch (command) {
		case "M":
			return { type: "M", x: n[0] as number, y: n[1] as number };
		case "m":
			return { type: "m", dx: n[0] as number, dy: n[1] as number };
		case "L":
			return { type: "L", x: n[0] as number, y: n[1] as number };
		case "l":
			return { type: "l", dx: n[0] as number, dy: n[1] as number };
		case "H":
			return { type: "H", x: n[0] as number };
		case "h":
			return { type: "h", dx: n[0] as number };
		case "V":
			return { type: "V", y: n[0] as number };
		case "v":
			return { type: "v", dy: n[0] as number };
		case "C":
			return {
				type: "C",
				cp1x: n[0] as number,
				cp1y: n[1] as number,
				cp2x: n[2] as number,
				cp2y: n[3] as number,
				x: n[4] as number,
				y: n[5] as number,
			};
		case "c":
			return {
				type: "c",
				cp1dx: n[0] as number,
				cp1dy: n[1] as number,
				cp2dx: n[2] as number,
				cp2dy: n[3] as number,
				dx: n[4] as number,
				dy: n[5] as number,
			};
		case "S":
			return {
				type: "S",
				cpx: n[0] as number,
				cpy: n[1] as number,
				x: n[2] as number,
				y: n[3] as number,
			};
		case "s":
			return {
				type: "s",
				cpdx: n[0] as number,
				cpdy: n[1] as number,
				dx: n[2] as number,
				dy: n[3] as number,
			};
		case "Q":
			return {
				type: "Q",
				cpx: n[0] as number,
				cpy: n[1] as number,
				x: n[2] as number,
				y: n[3] as number,
			};
		case "q":
			return {
				type: "q",
				cpdx: n[0] as number,
				cpdy: n[1] as number,
				dx: n[2] as number,
				dy: n[3] as number,
			};
		case "T":
			return { type: "T", x: n[0] as number, y: n[1] as number };
		case "t":
			return { type: "t", dx: n[0] as number, dy: n[1] as number };
		case "A":
			return {
				type: "A",
				rx: n[0] as number,
				ry: n[1] as number,
				xAxisRotation: n[2] as number,
				largeArcFlag: n[3] === 1,
				sweepFlag: n[4] === 1,
				x: n[5] as number,
				y: n[6] as number,
			};
		case "a":
			return {
				type: "a",
				rx: n[0] as number,
				ry: n[1] as number,
				xAxisRotation: n[2] as number,
				largeArcFlag: n[3] === 1,
				sweepFlag: n[4] === 1,
				dx: n[5] as number,
				dy: n[6] as number,
			};
		default:
			return { type: "Z" };
	}
};

/**
 * Parses an SVG path string into instructions, compatible with Remotion's
 * `parsePath()`. Relative commands stay relative; implicit repetitions become
 * separate instructions (extra pairs after `M`/`m` become `L`/`l`).
 * Throws on malformed path data.
 *
 * @example parsePath("M 10 10 L 20 20") // [{type: "M", x: 10, y: 10}, {type: "L", x: 20, y: 20}]
 */
export const parsePath = (path: string): Instruction[] => {
	if (!path) {
		throw new Error(
			`No SVG path data was given (got ${JSON.stringify(path)}): pass a string such as "M 0 0 L 10 10".`,
		);
	}
	const segments = path.match(SEGMENT);
	if (segments === null) {
		throw new Error(
			`"${path}" holds no SVG path commands: path data starts with a command such as M.`,
		);
	}
	const instructions: Instruction[] = [];
	for (const segment of segments) {
		const command = segment.charAt(0);
		const lower = command.toLowerCase();
		const args = segment.slice(1);
		const arity = ARITY[lower] as number;
		const tokens = lower === "a" ? scanArcTokens(command, args) : (args.match(NUMBER) ?? []);
		if (arity === 0) {
			if (tokens.length > 0) throw arityError(command, tokens);
			instructions.push({ type: "Z" });
			continue;
		}
		if (tokens.length === 0) {
			throw malformed(`${command} is not followed by any numbers.`);
		}
		if (tokens.length % arity !== 0) throw arityError(command, tokens);
		const numbers = tokens.map(Number);
		for (let i = 0; i < numbers.length; i += arity) {
			const repeated = i > 0 && lower === "m" ? (command === "m" ? "l" : "L") : command;
			instructions.push(build(repeated, numbers.slice(i, i + arity)));
		}
	}
	return instructions;
};
