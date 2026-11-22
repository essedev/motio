import {
	centerPath,
	cutPath,
	evolvePath,
	extendViewBox,
	getBoundingBox,
	getInstructionIndexAtLength,
	getLength,
	getPointAtLength,
	getSubpaths,
	getTangentAtLength,
	interpolatePath,
	interpolatePaths,
	normalizePath,
	parsePath,
	reduceInstructions,
	resetPath,
	reversePath,
	scalePath,
	serializeInstructions,
	translatePath,
	warpPath,
} from "@remotion/paths";
import { Easing } from "remotion";
import { capture, makeRng, writeFixture } from "./lib.mjs";

const PACKAGE = "@remotion/paths";
const makePick = (rng) => (items) => items[Math.floor(rng() * items.length)];

// Valid paths: every command in absolute and relative form, arcs with zero,
// small (scaled-up) and large radii, closes in the middle, paths that do not
// start with a move, repeated moves.
const makePathGenerator = (rng) => {
	const pick = makePick(rng);
	const n = () => {
		const r = rng();
		if (r < 0.1) return 0;
		if (r < 0.5) return Math.round((rng() - 0.3) * 200);
		if (r < 0.6) return pick([1, -1, 0.5, 100, 1e-3]);
		return Math.round((rng() - 0.3) * 20000) / 100;
	};
	return () => {
		const parts = [];
		if (rng() < 0.95) parts.push(`${pick(["M", "m"])} ${n()} ${n()}`);
		const count = 1 + Math.floor(rng() * 7);
		for (let i = 0; i < count; i++) {
			const c = pick("LlHhVvCcSsQqTtAaZzMmLC".split(""));
			const lc = c.toLowerCase();
			if (lc === "a") {
				parts.push(
					`${c} ${pick([0, Math.abs(n()), 5, 50, -20])} ${pick([0, Math.abs(n()), 5, 30])} ${pick([0, 30, -45, 90, n()])} ${pick([0, 1])} ${pick([0, 1])} ${n()} ${n()}`,
				);
			} else if (lc === "z") {
				parts.push(c);
			} else {
				const arity = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2 }[lc];
				parts.push(`${c} ${Array.from({ length: arity }, n).join(" ")}`);
			}
		}
		return parts.join(" ");
	};
};

// Raw strings for the parser: numbers in every notation, separators, junk
// characters, compact arc flags, wrong argument counts.
const makeParseInput = (rng) => {
	const pick = makePick(rng);
	const num = () =>
		pick([
			"0",
			"1",
			"-1",
			"10",
			".5",
			"-.5",
			"1.5",
			"1e2",
			"1E-1",
			"+3",
			"1.",
			"1.e2",
			"007",
			"2e",
			"-0",
			"0.0001",
			"123.456",
			"1-2",
			"3.5.5",
			"1e+2",
			"-",
		]);
	const sep = () => pick([" ", " ", ",", "\n", "", "  ", ", ", "\t"]);
	const junk = () => pick(["x", "#", ";", "B", "é", "(", ""]);
	const arcArgs = () =>
		`${[num(), num(), num()].join(sep())}${sep()}${pick(["0", "1", "2", "0 1", "1 0", "11", "00", "10", "01", ".5"])}${sep()}${pick(["1", "0", ""])}${sep()}${num()}${sep()}${num()}`;
	let s = rng() < 0.1 ? pick(["", " ", "10 ", "x"]) : "";
	const count = 1 + Math.floor(rng() * 6);
	for (let i = 0; i < count; i++) {
		const c = pick("MmLlHhVvCcSsQqTtAaZz".split(""));
		s += c;
		const arity = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 }[c.toLowerCase()];
		if (c.toLowerCase() === "a") {
			const k = 1 + Math.floor(rng() * 2);
			for (let j = 0; j < k; j++) s += sep() + arcArgs();
		} else {
			const total =
				arity * (rng() < 0.8 ? 1 + Math.floor(rng() * 2) : 0) +
				(rng() < 0.15 ? Math.floor(rng() * 3) - 1 : 0);
			for (let j = 0; j < total; j++) s += sep() + num();
		}
		if (rng() < 0.1) s += junk();
		s += sep();
	}
	return s;
};

// Warp functions, rebuilt by name in the tests.
export const WARPS = {
	sine: ({ x, y }) => ({ x: x + Math.sin(y / 4) * 5, y }),
	shear: ({ x, y }) => ({ x: x * 1.5 - y * 0.25, y: y + Math.cos(x / 10) * 3 }),
	identity: (p) => p,
};

// Easing specs, rebuilt in the tests from @motiojs/core.
const buildEasing = (spec) => {
	if (spec === undefined) return undefined;
	if (typeof spec === "string") return Easing[spec];
	if (spec[0] === "bezier") return Easing.bezier(spec[1], spec[2], spec[3], spec[4]);
	return Easing[spec[0]](buildEasing(spec[1]));
};

const FRACTIONS = [0, 0.001, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999, 1, 1.01];
const CASES = 500;

export const recordPaths = () => {
	const parseRng = makeRng(501);
	const parseInputs = ["M 10 10 L 20 20", "", " ", "remotion", "M 0 0 A 5 5 0 1110 10"];
	for (let i = 0; i < 1500; i++) parseInputs.push(makeParseInput(parseRng));
	writeFixture(
		"paths",
		PACKAGE,
		"parse",
		"parsePath on generated strings (valid, malformed, compact arcs), and serializeInstructions of the result",
		parseInputs.map((input) => {
			const parsed = capture(() => parsePath(input));
			return {
				input,
				parsed,
				serialized: parsed.out === undefined ? null : serializeInstructions(parsed.out),
			};
		}),
	);

	const genA = makePathGenerator(makeRng(502));
	const paths = [
		"M 0 0 L 100 0 L 100 100",
		"M 35,50 a 25,25,0,1,1,50,0 a 25,25,0,1,1,-50,0",
		"S 1 1 2 2",
		"M 5 5",
	];
	for (let i = 0; i < CASES; i++) paths.push(genA());

	writeFixture(
		"paths",
		PACKAGE,
		"transform",
		"normalizePath, reduceInstructions, reversePath, translatePath, scalePath, getBoundingBox, resetPath, centerPath, getSubpaths on generated paths",
		paths.map((path) => ({
			path,
			normalize: capture(() => normalizePath(path)),
			reduce: capture(() => serializeInstructions(reduceInstructions(parsePath(path)))),
			reverse: capture(() => reversePath(path)),
			translate: capture(() => [translatePath(path, 10, -5.5), translatePath(path, 0.1, 0.2)]),
			scale: capture(() => [scalePath(path, 2, 0.5), scalePath(path, -1, 3.3)]),
			boundingBox: capture(() => getBoundingBox(path)),
			reset: capture(() => resetPath(path)),
			center: capture(() => [centerPath(path), centerPath(path, { x: 33.3, y: -7 })]),
			subpaths: capture(() => getSubpaths(path)),
		})),
	);

	writeFixture(
		"paths",
		PACKAGE,
		"measure",
		`getLength, getPointAtLength, getTangentAtLength and getInstructionIndexAtLength at fractions ${FRACTIONS.join(", ")} of the length, on generated paths`,
		paths.map((path) => {
			const length = capture(() => getLength(path));
			const at = (fn) =>
				length.out === undefined ? null : FRACTIONS.map((f) => capture(() => fn(length.out * f)));
			return {
				path,
				length,
				points: at((l) => getPointAtLength(path, l)),
				tangents: at((l) => getTangentAtLength(path, l)),
				indices: at((l) => getInstructionIndexAtLength(path, l)),
				negative: capture(() => getPointAtLength(path, -5)),
			};
		}),
	);

	writeFixture(
		"paths",
		PACKAGE,
		"cut-evolve",
		`cutPath at -1 and at fractions ${FRACTIONS.join(", ")} of the length, and evolvePath, on generated paths`,
		paths.map((path) => {
			const length = capture(() => getLength(path));
			return {
				path,
				cut:
					length.out === undefined
						? null
						: [-1, ...FRACTIONS].map((f) => capture(() => cutPath(path, length.out * f))),
				evolve: [0, 1e-9, 0.1, 0.3, 0.5, 0.7, 1, 1.5, -0.5].map((p) =>
					capture(() => evolvePath(p, path)),
				),
			};
		}),
	);

	const genB = makePathGenerator(makeRng(503));
	const pairs = [
		["M 0 0 L 100 0", "M 100 0 L 0 0"],
		["M 0 0 Q 50 50 100 0", "M 0 0 L 100 0"],
	];
	for (let i = 0; i < 900; i++) pairs.push([genB(), genB()]);
	const VALUES = [0, 0.3, -0.4, 1.7, 1];
	writeFixture(
		"paths",
		PACKAGE,
		"interpolate",
		`interpolatePath(v, a, b) and interpolatePaths(v, [0, 1], [a, b]) for v in ${VALUES.join(", ")} on generated path pairs`,
		pairs.map(([a, b]) => ({
			a,
			b,
			path: VALUES.map((v) => capture(() => interpolatePath(v, a, b))),
			paths: VALUES.map((v) => capture(() => interpolatePaths(v, [0, 1], [a, b]))),
		})),
	);

	// Keyframe options of interpolatePaths, on paths that always match.
	const keyframes = [
		"M 0 0 L 10 0 L 10 10",
		"M 0 0 C 5 5 10 5 20 0",
		"M 5 5 L 20 20 L 0 30 L -5 5",
	];
	const easings = [
		undefined,
		"quad",
		["bezier", 0.42, 0, 0.58, 1],
		["out", "cubic"],
		["inOut", "sin"],
	];
	const options = [];
	for (const easing of easings) {
		for (const extrapolateLeft of [undefined, "clamp", "wrap", "extend"]) {
			for (const extrapolateRight of [undefined, "clamp", "wrap"]) {
				for (const posterize of [undefined, 0.5]) {
					options.push({ easing, extrapolateLeft, extrapolateRight, posterize });
				}
			}
		}
	}
	const inputs = [-1.3, 0, 0.25, 1, 1.5, 2, 2.7, 4.2];
	writeFixture(
		"paths",
		PACKAGE,
		"interpolate-keyframes",
		"interpolatePaths over three keyframes at inputRange [0, 1, 2] with easing specs, extrapolation and posterize; plus argument errors",
		[
			...options.map((o) => {
				const built = {};
				if (o.easing !== undefined) built.easing = buildEasing(o.easing);
				if (o.extrapolateLeft !== undefined) built.extrapolateLeft = o.extrapolateLeft;
				if (o.extrapolateRight !== undefined) built.extrapolateRight = o.extrapolateRight;
				if (o.posterize !== undefined) built.posterize = o.posterize;
				return {
					options: o,
					inputRange: [0, 1, 2],
					outputRange: keyframes,
					inputs,
					out: inputs.map((x) => capture(() => interpolatePaths(x, [0, 1, 2], keyframes, built))),
				};
			}),
			...[
				{ inputRange: [], outputRange: [] },
				{ inputRange: [1, 0], outputRange: keyframes.slice(0, 2) },
				{ inputRange: [0, 1], outputRange: keyframes.slice(0, 1) },
				{ inputRange: [0], outputRange: keyframes.slice(0, 1) },
			].map((c) => ({
				options: {},
				...c,
				inputs: [0.5],
				out: [capture(() => interpolatePaths(0.5, c.inputRange, c.outputRange))],
			})),
		],
	);

	const genC = makePathGenerator(makeRng(504));
	const warpPaths = ["M 0 0 L 0 100"];
	for (let i = 0; i < 60; i++) warpPaths.push(genC());
	writeFixture(
		"paths",
		PACKAGE,
		"warp",
		"warpPath with the named warp functions (see record-paths.mjs WARPS) and thresholds",
		warpPaths.map((path, i) => ({
			path,
			sine: capture(() => warpPath(path, WARPS.sine, { interpolationThreshold: 25 })),
			shear: capture(() => warpPath(path, WARPS.shear, { interpolationThreshold: 40 })),
			identity: i < 8 ? capture(() => warpPath(path, WARPS.identity)) : null,
		})),
	);

	const vbRng = makeRng(505);
	const viewBoxes = [
		"0 0 1000 1000",
		"10 20 30 40",
		"0,0,100,100",
		"  0  0  10  10 ",
		"0 0 10",
		"a b c d",
		"0 0 -10 10",
		"",
		"0 0 0 10",
		"0 0 10 Infinity",
		"0x10 0 10 10",
	];
	for (let i = 0; i < 300; i++) {
		const values = [0, 0, 0, 0].map((_, k) =>
			k < 2 ? Math.round((vbRng() - 0.5) * 2000) / 10 : Math.round(vbRng() * 2000) / 10,
		);
		viewBoxes.push(values.join(vbRng() < 0.5 ? " " : ","));
	}
	writeFixture(
		"paths",
		PACKAGE,
		"extend-viewbox",
		"extendViewBox for scales 2, 0.5, 1, 1.37, 3.14159, 0.001, -1",
		viewBoxes.map((viewBox) => ({
			viewBox,
			// biome-ignore lint/suspicious/noApproximativeNumericConstant: an arbitrary scale, not pi
			out: [2, 0.5, 1, 1.37, 3.14159, 0.001, -1].map((s) =>
				capture(() => extendViewBox(viewBox, s)),
			),
		})),
	);
};
