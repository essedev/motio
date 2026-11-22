// Records outputs of the published Remotion package as JSON fixtures for
// @motiojs/core. Only Remotion's public API is called: the package is treated
// as a black box (see docs/ARCHITECTURE.md, "Compatibility").
//
// Usage: pnpm install && pnpm record

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Easing, interpolate, interpolateColors, measureSpring, random, spring } from "remotion";
import { CSS_NAMED_COLORS } from "./named-colors.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "../../packages/core/src/__oracle__");
const remotionVersion = JSON.parse(
	readFileSync(join(here, "node_modules/remotion/package.json"), "utf8"),
).version;

// JSON cannot hold NaN, Infinity or -0: they are written as strings that
// Number() parses back ("NaN", "Infinity", "-Infinity", "-0").
const encodeNumber = (n) => {
	if (typeof n !== "number") return n;
	if (Number.isNaN(n)) return "NaN";
	if (n === Number.POSITIVE_INFINITY) return "Infinity";
	if (n === Number.NEGATIVE_INFINITY) return "-Infinity";
	if (Object.is(n, -0)) return "-0";
	return n;
};
const encodeDeep = (value) => {
	if (Array.isArray(value)) return value.map(encodeDeep);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeDeep(v)]));
	}
	return encodeNumber(value);
};

// Runs fn and returns either { out } or { error } with the thrown message.
const capture = (fn) => {
	try {
		return { out: fn() };
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e) };
	}
};

const write = (name, description, cases) => {
	mkdirSync(outDir, { recursive: true });
	const body = { remotionVersion, description, cases: encodeDeep(cases) };
	const text = `${JSON.stringify(body)}\n`;
	writeFileSync(join(outDir, `${name}.json`), text);
	console.log(`${name}.json: ${cases.length} cases, ${(text.length / 1024).toFixed(0)} KiB`);
};

// Deterministic generator for the input grids (mulberry32), so a re-record
// with the same Remotion version produces byte-identical fixtures.
const makeRng = (seed) => {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

const linspace = (from, to, steps) =>
	Array.from({ length: steps + 1 }, (_, i) => from + ((to - from) * i) / steps);

// Easing specs: a small JSON language shared with the tests, which rebuild
// the same easing from @motiojs/core.
//   "linear" | "quad" | ...           a constant easing
//   ["poly", n] | ["elastic", b?] | ["back", s?] | ["bezier", x1, y1, x2, y2]
//   ["in" | "out" | "inOut", spec]
const buildEasing = (spec) => {
	if (typeof spec === "string") return Easing[spec];
	const [name, ...args] = spec;
	if (name === "in" || name === "out" || name === "inOut")
		return Easing[name](buildEasing(args[0]));
	return Easing[name](...args);
};

// Fixture options name a single easing spec `easing` and a per-segment list
// `easingSegments`, because a spec can itself be an array. Remotion takes both
// as `easing`.
const toRemotionOptions = (options) => {
	if (options === undefined) return undefined;
	const { easing, easingSegments, ...rest } = options;
	if (easingSegments !== undefined) return { ...rest, easing: easingSegments.map(buildEasing) };
	if (easing !== undefined) return { ...rest, easing: buildEasing(easing) };
	return rest;
};

const BASE_EASINGS = [
	"linear",
	"ease",
	"quad",
	"cubic",
	"sin",
	"circle",
	"exp",
	"bounce",
	["poly", 0.5],
	["poly", 2],
	["poly", 4],
	["poly", 5],
	["elastic"],
	["elastic", 0],
	["elastic", 0.5],
	["elastic", 1],
	["elastic", 2],
	["elastic", 4],
	["back"],
	["back", 0],
	["back", 1.70158],
	["back", 3],
	["bezier", 0.25, 0.1, 0.25, 1],
	["bezier", 0.42, 0, 1, 1],
	["bezier", 0, 0, 0.58, 1],
	["bezier", 0.42, 0, 0.58, 1],
	["bezier", 0.8, 0.22, 0.96, 0.65],
	["bezier", 0.5, 0.01, 0.5, 1],
	["bezier", 0.68, -0.55, 0.265, 1.55],
	["bezier", 0, 0, 1, 1],
	["bezier", 0.1, 0.9, 0.9, 0.1],
	["bezier", 1, 0, 0, 1],
	["bezier", 0.33, 1.5, 0.66, -0.5],
	["bezier", 0, 1, 0, 1],
	["bezier", 1, 0, 1, 0],
];

const recordEasing = () => {
	const ts = [...linspace(0, 1, 100), -0.5, -0.1, 1.1, 1.5, 1e-9, 1 - 1e-9];
	const specs = [];
	for (const base of BASE_EASINGS) {
		specs.push(base);
		for (const mod of ["in", "out", "inOut"]) specs.push([mod, base]);
	}
	specs.push(["in", ["out", "quad"]], ["inOut", ["inOut", "cubic"]], ["out", ["poly", 3]]);
	const rng = makeRng(7);
	for (let i = 0; i < 40; i++) {
		const r = (lo, hi) => Number((lo + (hi - lo) * rng()).toFixed(3));
		specs.push(["bezier", r(0, 1), r(-1, 2), r(0, 1), r(-1, 2)]);
	}
	const cases = specs.map((spec) => {
		const fn = buildEasing(spec);
		return { easing: spec, t: ts, out: ts.map((t) => fn(t)) };
	});
	const steps = ["step0", "step1"].map((name) => {
		const inputs = [-1, -1e-9, 0, 1e-9, 0.5, 1 - 1e-9, 1, 1.5];
		return { easing: name, t: inputs, out: inputs.map((t) => Easing[name](t)) };
	});
	const bezierErrors = [
		[-0.1, 0, 1, 1],
		[0, 0, 1.1, 1],
		[Number.NaN, 0, 1, 1],
	].map((args) => ({ easing: ["bezier", ...args], ...capture(() => Easing.bezier(...args)(0.5)) }));
	write("easing", "Easing functions sampled over t; easing specs as in record.mjs", [
		...cases,
		...steps,
		...bezierErrors,
	]);
};

const EXTRAPOLATIONS = ["extend", "clamp", "identity", "wrap"];

const inputsFor = (inputRange) => {
	const lo = inputRange[0];
	const hi = inputRange[inputRange.length - 1];
	const span = hi - lo || 1;
	const grid = linspace(lo - 2.5 * span, hi + 2.5 * span, 60);
	return [...new Set([...grid, ...inputRange, lo - 1e-7, hi + 1e-7])].sort((a, b) => a - b);
};

const recordInterpolate = () => {
	const ranges = [
		[
			[0, 1],
			[0, 1],
		],
		[
			[0, 1],
			[1, 0],
		],
		[
			[0, 20],
			[0, 1],
		],
		[
			[0, 10, 30],
			[0, 100, 200],
		],
		[
			[-5, 0, 5],
			[10, -10, 30],
		],
		[
			[1, 2, 4, 8],
			[0, 1, 0, 1],
		],
		[
			[0, 100],
			[-3.5, 1e6],
		],
		[
			[0, 1],
			[5, 5],
		],
		[
			[0, 1e-6],
			[0, 1],
		],
		[
			[-1e9, 1e9],
			[0, 1],
		],
		[[5], [3]],
		[[0], [-2]],
	];
	const cases = [];
	for (const [inputRange, outputRange] of ranges) {
		const inputs = inputsFor(inputRange);
		for (const extrapolateLeft of EXTRAPOLATIONS) {
			for (const extrapolateRight of EXTRAPOLATIONS) {
				const options = { extrapolateLeft, extrapolateRight };
				cases.push({
					inputRange,
					outputRange,
					options,
					inputs,
					out: inputs.map((x) => interpolate(x, inputRange, outputRange, options)),
				});
			}
		}
		cases.push({
			inputRange,
			outputRange,
			options: {},
			inputs,
			out: inputs.map((x) => interpolate(x, inputRange, outputRange)),
		});
	}
	// Easing combined with every extrapolation mode.
	const easingRanges = [ranges[0], ranges[3], ranges[5]];
	const easingSpecs = [
		"quad",
		["out", "cubic"],
		["bezier", 0.68, -0.55, 0.265, 1.55],
		["elastic", 2],
		"bounce",
	];
	for (const [inputRange, outputRange] of easingRanges) {
		const inputs = inputsFor(inputRange);
		for (const easing of easingSpecs) {
			for (const extrapolateLeft of EXTRAPOLATIONS) {
				for (const extrapolateRight of EXTRAPOLATIONS) {
					const options = { extrapolateLeft, extrapolateRight, easing: buildEasing(easing) };
					cases.push({
						inputRange,
						outputRange,
						options: { extrapolateLeft, extrapolateRight, easing },
						inputs,
						out: inputs.map((x) => interpolate(x, inputRange, outputRange, options)),
					});
				}
			}
		}
	}
	// Per-segment easing arrays.
	const arrayCases = [
		[
			[0, 100, 200],
			[0, 1, 2],
			[
				["out", "cubic"],
				["in", "cubic"],
			],
		],
		[
			[0, 10, 30],
			[0, 100, 200],
			["quad", "bounce"],
		],
		[
			[1, 2, 4, 8],
			[0, 1, 0, 1],
			["linear", ["elastic", 1], ["bezier", 0.1, 0.9, 0.9, 0.1]],
		],
		[[5], [3], []],
	];
	for (const [inputRange, outputRange, easing] of arrayCases) {
		const inputs = inputsFor(inputRange);
		for (const extrapolateRight of EXTRAPOLATIONS) {
			const options = { extrapolateRight, easing: easing.map(buildEasing) };
			cases.push({
				inputRange,
				outputRange,
				options: { extrapolateRight, easingSegments: easing },
				inputs,
				out: inputs.map((x) => interpolate(x, inputRange, outputRange, options)),
			});
		}
	}
	// Posterize.
	for (const posterize of [1, 3, 2.5, 0.5, 7]) {
		const inputRange = [0, 60];
		const outputRange = [0, 1];
		const inputs = linspace(-10, 70, 160);
		for (const extrapolateRight of ["extend", "clamp"]) {
			const options = { posterize, extrapolateRight };
			cases.push({
				inputRange,
				outputRange,
				options,
				inputs,
				out: inputs.map((x) => interpolate(x, inputRange, outputRange, options)),
			});
		}
	}
	// Non-finite inputs are not validated; record what they produce.
	const special = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0];
	for (const [inputRange, outputRange] of [ranges[0], ranges[3]]) {
		for (const extrapolateLeft of EXTRAPOLATIONS) {
			for (const extrapolateRight of EXTRAPOLATIONS) {
				const options = { extrapolateLeft, extrapolateRight };
				cases.push({
					inputRange,
					outputRange,
					options,
					inputs: special,
					out: special.map((x) => interpolate(x, inputRange, outputRange, options)),
				});
			}
		}
	}
	write("interpolate", "interpolate() over input grids; options.easing holds easing specs", cases);

	const errorCases = [
		[0.5, [0, 0], [0, 1]],
		[0.5, [1, 0], [0, 1]],
		[0.5, [0, 2, 1], [0, 1, 2]],
		[0.5, [0, 1], [0]],
		[0.5, [0], [0, 1]],
		[0.5, [], []],
		[0.5, [0, Number.NaN], [0, 1]],
		[0.5, [0, Number.POSITIVE_INFINITY], [0, 1]],
		[0.5, [Number.NEGATIVE_INFINITY, 0], [0, 1]],
		[0.5, [0, 1], [0, Number.NaN]],
		[0.5, [0, 1], [0, Number.POSITIVE_INFINITY]],
		[0.5, [0, 1], [Number.NEGATIVE_INFINITY, 1]],
		[0.5, [0, 1], [0, 1], { easingSegments: [] }],
		[0.5, [0, 1, 2], [0, 1, 2], { easingSegments: ["quad"] }],
		[0.5, [0, 1], [0, 1], { posterize: 0 }],
		[0.5, [0, 1], [0, 1], { posterize: -1 }],
		[0.5, [0, 1], [0, 1], { posterize: Number.NaN }],
		[0.5, [0, 1], [0, 1], { posterize: Number.POSITIVE_INFINITY }],
		["0.5", [0, 1], [0, 1]],
		[undefined, [0, 1], [0, 1]],
		[null, [0, 1], [0, 1]],
		[0.5, [0, 1], [0, 1], { extrapolateLeft: "nope", extrapolateRight: "nope" }],
		[-1, [0, 1], [0, 1], { extrapolateLeft: "nope" }],
		[2, [0, 1], [0, 1], { extrapolateRight: "nope" }],
	];
	write(
		"interpolate-errors",
		"interpolate() validation: each case is [input, inputRange, outputRange, options?] with out or error",
		errorCases.map(([input, inputRange, outputRange, options]) => {
			const realOptions = toRemotionOptions(options);
			return {
				input: input === undefined ? "undefined" : input,
				inputType: typeof input,
				inputRange,
				outputRange,
				options: options ?? {},
				...capture(() => interpolate(input, inputRange, outputRange, realOptions)),
			};
		}),
	);
};

const recordColors = () => {
	const t = [...linspace(0, 1, 40), -0.5, 1.5];
	const cases = [];
	const push = (inputRange, outputRange, inputs = t, options) => {
		const realOptions = toRemotionOptions(options);
		const results = inputs.map((x) =>
			capture(() => interpolateColors(x, inputRange, outputRange, realOptions)),
		);
		const firstError = results.find((r) => "error" in r);
		cases.push({
			inputRange,
			outputRange,
			options: options ?? {},
			inputs,
			...(firstError ? { error: firstError.error } : { out: results.map((r) => r.out) }),
		});
	};
	const formats = [
		["red", "yellow"],
		["#ff0000", "#ffff00"],
		["rgb(255, 0, 0)", "rgb(255, 255, 0)"],
		["rgba(255, 0, 0, 1)", "rgba(255, 255, 0, 0)"],
		["hsl(0, 100%, 50%)", "hsl(60, 100%, 50%)"],
		["hsla(0, 100%, 50%, 1)", "hsla(60, 100%, 50%, 1)"],
		["#abc", "#12345678"],
		["#abcd", "#0f0"],
		["#ABCDEF", "#fedcba"],
		["#00000000", "#ffffffff"],
		["#11223344", "#aabbccdd"],
		["rgb(0,0,0)", "rgba(10,20,30,0.25)"],
		["rgba(255,255,255,0)", "rgba(0, 0, 0, 0.5)"],
		["rgba(12, 34, 56, .3)", "rgba(200, 100, 50, 0.777)"],
		["rgb(300, -20, 128)", "rgb(0, 0, 0)"],
		["rgb(12.5, 100.4, 200.6)", "white"],
		["hsl(120, 50%, 30%)", "hsla(240, 100%, 75%, 0.4)"],
		["hsl(-90, 20%, 80%)", "hsl(450, 60%, 10%)"],
		["hsl(200, 0%, 50%)", "hsl(330, 100%, 0%)"],
		["hsla(33.3, 44.4%, 55.5%, 0.66)", "hsl(300, 100%, 100%)"],
		["transparent", "hsla(120, 50%, 30%, 0.3)"],
		["transparent", "white"],
		["black", "white"],
		["rebeccapurple", "papayawhip"],
	];
	for (const outputRange of formats) push([0, 1], outputRange);
	push([0, 20], ["red", "yellow"], linspace(-5, 25, 30));
	push([0, 30, 60], ["black", "red", "white"], linspace(-10, 70, 80));
	push([0, 1, 2, 3], ["#000", "#f00", "#0f0", "#00f"], linspace(-1, 4, 50));
	push([5], ["rgba(1, 2, 3, 0.4)"], [0, 5, 10]);
	push([5], ["red"], [0, 5, 10]);
	push([0, 1], ["red", "blue"], t, { easing: "quad" });
	push([0, 1], ["red", "blue"], t, { easing: ["bezier", 0.68, -0.55, 0.265, 1.55] });
	push([0, 30, 60], ["black", "red", "white"], linspace(-10, 70, 80), {
		easingSegments: [
			["in", "quad"],
			["out", "quad"],
		],
	});
	push([0, 60], ["black", "white"], linspace(-5, 65, 70), { posterize: 3 });
	// Every CSS named color, against black and against a translucent color.
	for (const name of CSS_NAMED_COLORS) {
		push([0, 1], [name, "black"], [0, 0.3, 1]);
		push([0, 1], ["rgba(10, 20, 30, 0.5)", name], [0.5]);
	}
	// Modern color functions (documented since 4.0.439).
	const modern = [
		["oklch(0.5 0.2 240)", "oklch(0.9 0.1 120)"],
		["oklch(0.5 0.2 240 / 1)", "oklch(0.9 0.1 120 / 0.5)"],
		["oklab(0.5 -0.1 0.1)", "oklab(0.9 0 0)"],
		["lab(50 -20 40)", "lab(90 0 0)"],
		["lch(50 60 240)", "lch(90 30 120)"],
		["hwb(0 0% 0%)", "hwb(120 10% 10%)"],
		["hwb(100grad 0% 0%)", "hwb(2turn 0% 0%)"],
	];
	for (const outputRange of modern) push([0, 1], outputRange);
	// Dense random sample of modern colors, each read back exactly (input 0).
	const crng = makeRng(99);
	const r = (lo, hi, digits = 3) => Number((lo + (hi - lo) * crng()).toFixed(digits));
	const randomModern = [];
	for (let i = 0; i < 250; i++) {
		const alpha = crng() < 0.3 ? ` / ${r(0, 1)}` : "";
		randomModern.push(
			`oklch(${r(0, 1)} ${r(0, 0.4)} ${r(0, 360, 1)}${alpha})`,
			`oklab(${r(0, 1)} ${r(-0.4, 0.4)} ${r(-0.4, 0.4)}${alpha})`,
			`lab(${r(0, 100, 2)} ${r(-125, 125, 2)} ${r(-125, 125, 2)}${alpha})`,
			`lch(${r(0, 100, 2)} ${r(0, 150, 2)} ${r(0, 360, 1)}${alpha})`,
			`hwb(${r(0, 360, 1)} ${r(0, 100, 1)}% ${r(0, 100, 1)}%${alpha})`,
			`hsl(${r(-360, 720, 2)}, ${r(0, 100, 2)}%, ${r(0, 100, 2)}%)`,
		);
	}
	for (const color of randomModern) push([0, 1], [color, "black"], [0]);
	write(
		"interpolate-colors",
		"interpolateColors() over input grids; error is the first error thrown for any input",
		cases,
	);

	// Strings that Remotion rejects or accepts; one call each at progress 0.5.
	const probes = [
		"RED",
		"Red",
		"#FFF",
		"#ff",
		"#fffff",
		"#ggg",
		"ff0000",
		"rgb(100%, 0%, 0%)",
		"rgb(255 0 0)",
		"rgb(255 0 0 / 0.5)",
		"rgba(255, 0, 0)",
		"rgb(255, 0, 0, 0.5)",
		"hsl(120deg, 50%, 50%)",
		"hsl(120 50% 50%)",
		"hsl(120, 50, 50)",
		"hsla(120, 50%, 50%)",
		" red",
		"red ",
		"rgb( 255 , 0 , 0 )",
		"rgba(255, 0, 0, 50%)",
		"rgba(255, 0, 0, 1.5)",
		"rgba(255, 0, 0, -0.5)",
		"currentcolor",
		"inherit",
		"",
		"foo",
		"oklch(50% 0.2 240)",
		"oklch(0.5 50% 240)",
		"oklch(0.5 0.2 240deg)",
		"oklch(0.5 0.2 4.1887902rad)",
		"oklch(0.5 0.2 0.6turn)",
		"oklch(0.5 0.2 -120)",
		"oklch(0.5 0.2 600)",
		"oklch(none 0.2 240)",
		"oklch(0.5,0.2,240)",
		"OKLCH(0.5 0.2 240)",
		"oklch(0.5 0.2 240 / 50%)",
		"oklch(0.5 0.2 240 / .25)",
		"oklch( 0.5 0.2 240 )",
		"oklch(1.2 0.5 30)",
		"oklab(50% -0.1 0.1)",
		"oklab(0.5 -25% 25%)",
		"oklab(0.5 -0.1 0.1 / .3)",
		"lab(50% 20 30)",
		"lab(50 -50% 50%)",
		"lab(50 20 30 / 0.5)",
		"lab(120 0 0)",
		"lch(50 60 -120)",
		"lch(50% 40% 90deg)",
		"lch(50 60 240 / 25%)",
		"hwb(120 10 10)",
		"hwb(90deg 20% 30% / 0.5)",
		"hwb(0 60% 60%)",
		"hwb(1rad 10% 10%)",
		"color(srgb 1 0 0)",
		"hsl(120deg 50% 50% / 0.5)",
	];
	const edgeCases = [
		[0.5, [1, 0], ["red", "blue"]],
		[0.5, [], []],
		[0.5, [0, Number.NaN], ["red", "blue"]],
		[0.5, [0, 1], ["red"]],
		[0.5, [0, 1], ["red", "blue"], { posterize: 0 }],
		[0.5, [0, 1], ["red", "blue"], { easingSegments: [] }],
		[Number.NaN, [0, 1], ["red", "blue"]],
		[Number.POSITIVE_INFINITY, [0, 1], ["red", "blue"]],
		[Number.NEGATIVE_INFINITY, [0, 1], ["red", "blue"]],
		["a", [0, 1], ["red", "blue"]],
		[undefined, [0, 1], ["red", "blue"]],
		[0.5, [0, 1], [123, "blue"]],
		[2, [0, 1], ["red", "blue"], { extrapolateRight: "extend" }],
		[-1, [0, 1], ["red", "blue"], { extrapolateLeft: "identity" }],
		[0.3, [0, 1], ["black", "white"], { easing: ["bezier", 0.68, -0.55, 0.265, 1.55] }],
		[0.7, [0, 1], ["black", "white"], { easing: ["bezier", 0.68, -0.55, 0.265, 1.55] }],
		[0.5, [0, 1], ["rgba(0,0,0,0.001)", "rgba(0,0,0,0.002)"]],
		[0.1, [0, 1], ["rgba(0,0,0,0)", "rgba(0,0,0,0.01)"]],
		[0, [0, 1], ["rgb(12.5, 100.4, 200.6)", "red"]],
		[0, [0, 1], ["rgb(0.5, 1.5, 2.5)", "red"]],
		[0.5, [0, 1], ["rgb(0.5, 1.5, 2.5)", "rgb(0, 0, 0)"]],
		[0.25, [0, 1], ["rgb(0.4, 0.4, 0.4)", "rgb(1.6, 1.6, 1.6)"]],
		[0, [0, 1], ["rgba(0,0,0,0.3)", "red"]],
		[0.5, [0, 1], ["rgba(0,0,0,0.3)", "rgba(0,0,0,0.3)"]],
	];
	write(
		"interpolate-colors-edge",
		"interpolateColors() edge cases: each case is [input, inputRange, outputRange, options?] with out or error",
		edgeCases.map(([input, inputRange, outputRange, options]) => ({
			input: input === undefined ? "undefined" : input,
			inputType: typeof input,
			inputRange,
			outputRange,
			options: options ?? {},
			...capture(() =>
				interpolateColors(input, inputRange, outputRange, toRemotionOptions(options)),
			),
		})),
	);
	write(
		"interpolate-colors-parse",
		"interpolateColors(0.5, [0, 1], [probe, 'black']): accepted or rejected color strings",
		probes.map((probe) => ({
			probe,
			...capture(() => interpolateColors(0.5, [0, 1], [probe, "black"])),
		})),
	);
};

const SPRING_CONFIGS = (() => {
	const configs = [];
	for (const mass of [0.3, 1, 2, 5]) {
		for (const damping of [1, 5, 10, 20, 100, 200]) {
			for (const stiffness of [10, 50, 100, 200, 1000]) {
				for (const overshootClamping of [false, true]) {
					configs.push({ mass, damping, stiffness, overshootClamping });
				}
			}
		}
	}
	return configs;
})();

const recordSpring = () => {
	const cases = [];
	const frames = Array.from({ length: 121 }, (_, i) => i);
	for (const config of SPRING_CONFIGS) {
		const params = { fps: 30, config };
		cases.push({ params, frames, out: frames.map((frame) => spring({ ...params, frame })) });
	}
	write("spring", "spring() at fps 30 over frames 0..120 for a grid of physical configs", cases);

	const opt = [];
	const fineFrames = [-5, -1, -0.5, ...linspace(0, 90, 360), 120, 200, 1000];
	const add = (params) => {
		opt.push({
			params,
			frames: fineFrames,
			out: fineFrames.map((frame) => spring({ ...params, frame })),
		});
	};
	add({ fps: 30 });
	add({ fps: 24 });
	add({ fps: 60 });
	add({ fps: 29.97 });
	add({ fps: 30, from: 0, to: 1 });
	add({ fps: 30, from: 10, to: -5 });
	add({ fps: 30, from: 2, to: 2 });
	add({ fps: 30, from: -100, to: 300, config: { damping: 3 } });
	add({ fps: 30, config: {} });
	add({ fps: 30, config: { damping: 200 } });
	add({ fps: 30, config: { mass: 0.5, stiffness: 300 } });
	add({ fps: 30, config: { overshootClamping: true } });
	add({ fps: 30, from: 1, to: 0, config: { overshootClamping: true } });
	for (const durationInFrames of [1, 10, 30, 40, 75.5, 200]) {
		add({ fps: 30, durationInFrames });
		add({ fps: 30, durationInFrames, config: { damping: 200 } });
		add({ fps: 60, durationInFrames, config: { mass: 3, damping: 4, stiffness: 50 } });
	}
	for (const durationRestThreshold of [0.1, 0.01, 0.001, 0.0001]) {
		add({ fps: 30, durationInFrames: 30, durationRestThreshold });
		add({ fps: 30, durationInFrames: 30, durationRestThreshold, config: { damping: 200 } });
		add({ fps: 30, durationRestThreshold });
	}
	for (const delay of [-10, 0, 0.5, 5, 25]) {
		add({ fps: 30, delay });
		add({ fps: 30, delay, durationInFrames: 30 });
	}
	add({ fps: 30, reverse: true });
	add({ fps: 30, reverse: true, from: 3, to: 7 });
	add({ fps: 30, reverse: true, durationInFrames: 40 });
	add({ fps: 30, reverse: true, delay: 10 });
	add({ fps: 30, reverse: true, delay: 10, durationInFrames: 40, config: { damping: 5 } });
	add({ fps: 30, reverse: true, config: { overshootClamping: true, damping: 3 } });
	add({
		fps: 25,
		reverse: true,
		delay: 7,
		durationInFrames: 50,
		durationRestThreshold: 0.01,
		from: -1,
		to: 4,
		config: { mass: 2, damping: 15, stiffness: 80, overshootClamping: true },
	});
	write("spring-options", "spring() with from/to/fps/durationInFrames/delay/reverse variants", opt);

	const errors = [
		{ frame: 10, fps: 0 },
		{ frame: 10, fps: -30 },
		{ frame: Number.NaN, fps: 30 },
		{ frame: Number.POSITIVE_INFINITY, fps: 30 },
		{ fps: 30 },
		{ frame: 10, fps: 30, durationInFrames: 0 },
		{ frame: 10, fps: 30, durationInFrames: -5 },
		{ frame: 10, fps: 30, config: { mass: 0 } },
		{ frame: 10, fps: 30, config: { damping: 0 } },
		{ frame: 10, fps: 30, config: { stiffness: 0 } },
		{ frame: 10, fps: Number.NaN },
		{ frame: 10, fps: 30, config: { damping: -1 } },
		{ frame: 10, fps: 30, config: { mass: -1 } },
		{ frame: 10, fps: 30, config: { stiffness: -1 } },
		{ frame: 5, fps: 30, config: { mass: 0 }, durationInFrames: 10 },
		{ frame: 5, fps: 30, config: { mass: 0 }, reverse: true },
	];
	write(
		"spring-errors",
		"spring() validation and degenerate inputs",
		errors.map((params) => ({ params, ...capture(() => spring(params)) })),
	);
};

const recordMeasureSpring = () => {
	const cases = [];
	for (const config of SPRING_CONFIGS) {
		for (const fps of [24, 30, 60]) {
			for (const threshold of [undefined, 0.1, 0.01, 0.001]) {
				const params = threshold === undefined ? { fps, config } : { fps, config, threshold };
				cases.push({ params, out: measureSpring(params) });
			}
		}
	}
	const extra = [
		{ fps: 30 },
		{ fps: 30, config: { damping: 200 } },
		{ fps: 29.97, config: { damping: 15 } },
		{ fps: 30, from: 5, to: -5 },
		{ fps: 30, threshold: 0.5 },
		{ fps: 30, threshold: 1 },
		{ fps: 30, threshold: 0 },
		{ fps: 0 },
		{ fps: -1 },
		{ fps: 30, threshold: -0.1 },
		{ fps: 30, threshold: Number.NaN },
		{ fps: Number.NaN },
		{ fps: 30, config: { mass: 0 } },
		{ fps: 30, config: { mass: -1 } },
		{ fps: 30, config: { damping: 0 } },
		{ fps: 30, config: { damping: -1 } },
		{ fps: 30, config: { stiffness: -1 } },
		{ fps: 30, config: { stiffness: 0 }, threshold: 1 },
		// { stiffness: 0 } with a threshold below 1 never returns in Remotion.
	];
	for (const params of extra) cases.push({ params, ...capture(() => measureSpring(params)) });
	write("measure-spring", "measureSpring() for the config grid, fps and thresholds", cases);
};

const recordRandom = () => {
	const rng = makeRng(42);
	const numbers = [];
	for (let i = -1000; i <= 1000; i++) numbers.push(i);
	for (let i = 0; i < 1500; i++) numbers.push((rng() - 0.5) * 10 ** Math.floor(rng() * 12));
	for (let i = 0; i < 300; i++) numbers.push(Math.floor(rng() * 2 ** 53) * (rng() < 0.5 ? -1 : 1));
	numbers.push(
		-0,
		0.1,
		0.5,
		1e-10,
		2 ** 31 - 1,
		2 ** 31,
		2 ** 32 - 1,
		2 ** 32,
		2 ** 53,
		1e21,
		1e300,
		Number.MAX_VALUE,
		Number.MIN_VALUE,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
	);
	const strings = ["", " ", "a", "b", "ab", "ba", "random", "remotion", "motio"];
	for (let i = 0; i < 10; i++) strings.push(`random-x-${i}`, `random-y-${i}`);
	for (let i = 0; i < 128; i++) strings.push(String.fromCharCode(i));
	strings.push("é", "ü", "日本語", "😀", "👨‍👩‍👧", "a".repeat(1000), "xyz".repeat(333));
	// Strings with lone or paired surrogates, stored as UTF-16 code units
	// because some JSON parsers reject escaped lone surrogates.
	const codeUnitSeeds = [
		[0xd800],
		[0xdfff],
		[0x61, 0xd800, 0x62],
		[0xd83d, 0xde00],
		[0xdc00, 0xd800],
	];
	for (let i = 0; i < 100; i++) {
		const len = 1 + Math.floor(rng() * 6);
		codeUnitSeeds.push(Array.from({ length: len }, () => Math.floor(rng() * 0x10000)));
	}
	for (let i = 0; i < 2000; i++) {
		const len = 1 + Math.floor(rng() * 24);
		let s = "";
		for (let j = 0; j < len; j++) s += String.fromCharCode(32 + Math.floor(rng() * 95));
		strings.push(s);
	}
	for (let i = 0; i < 300; i++) {
		const len = 1 + Math.floor(rng() * 8);
		let s = "";
		for (let j = 0; j < len; j++) s += String.fromCharCode(Math.floor(rng() * 0xd7ff));
		strings.push(s);
	}
	for (let i = 0; i < 200; i++) strings.push(String(i));
	write("random", "random(seed) for number and string seeds", [
		{ kind: "number", seeds: numbers, out: numbers.map((s) => random(s)) },
		{ kind: "string", seeds: strings, out: strings.map((s) => random(s)) },
		{
			kind: "codeUnits",
			seeds: codeUnitSeeds,
			out: codeUnitSeeds.map((units) => random(String.fromCharCode(...units))),
		},
		...[undefined, {}, [], true, () => 1].map((seed) => ({
			kind: "invalid",
			seedType: Array.isArray(seed) ? "array" : typeof seed,
			...capture(() => random(seed)),
		})),
	]);
};

recordEasing();
recordInterpolate();
recordColors();
recordSpring();
recordMeasureSpring();
recordRandom();
