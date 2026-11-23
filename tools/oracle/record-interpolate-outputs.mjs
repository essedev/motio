// Records interpolate() with non-numeric outputs and the options added after
// the numeric core: CSS transform strings, discrete strings, booleans, numeric
// tuples, font weights, `output: "perceptual-scale"`, `outputType`, and easing
// functions that let a segment keep moving after its end (`allowTail`).
// Called by record.mjs; public API only.

import { interpolate } from "remotion";

// These fixtures hold strings, so NaN, infinities and -0 cannot be written as
// strings like in the numeric fixtures: they become { "$n": "NaN" } and
// undefined becomes { "$u": true }.
export const tag = (value) => {
	if (value === undefined) return { $u: true };
	if (typeof value === "number") {
		if (Number.isNaN(value)) return { $n: "NaN" };
		if (value === Number.POSITIVE_INFINITY) return { $n: "Infinity" };
		if (value === Number.NEGATIVE_INFINITY) return { $n: "-Infinity" };
		if (Object.is(value, -0)) return { $n: "-0" };
		return value;
	}
	if (Array.isArray(value)) return value.map(tag);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, tag(v)]));
	}
	return value;
};

// The built-in class an error derives from ("TypeError", "RangeError", ..., "Error"). The tests
// compare failures on this class and on the options the message names, never on its wording.
export const errorTypeOf = (e) => {
	for (const C of [TypeError, RangeError, SyntaxError, ReferenceError, EvalError, URIError]) {
		if (e instanceof C) return C.name;
	}
	return e instanceof Error ? "Error" : "unknown";
};

// Runs fn and returns either { out } or { error, errorType }: the thrown message and the
// built-in class of the error.
export const captureTyped = (fn) => {
	try {
		return { out: fn() };
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e), errorType: errorTypeOf(e) };
	}
};

const EXTRAPOLATIONS = ["extend", "clamp", "identity", "wrap"];

// Inputs over and around the input range: a coarse grid, the keyframes, the
// midpoints and points just inside and outside the ends.
const inputsAround = (inputRange, linspace) => {
	const lo = inputRange[0];
	const hi = inputRange[inputRange.length - 1];
	const span = hi - lo || 1;
	const mids = inputRange.slice(1).map((v, i) => (v + inputRange[i]) / 2);
	const grid = linspace(lo - 0.75 * span, hi + 0.75 * span, 12);
	return [...new Set([...grid, ...inputRange, ...mids, lo - 1e-9, hi + 1e-9, lo + span / 3])].sort(
		(a, b) => a - b,
	);
};

const rangeFor = (length) => {
	if (length === 1) return [0];
	if (length === 2) return [0, 1];
	if (length === 3) return [0, 1, 3];
	return [-2, 0, 1, 3];
};

// Output ranges that parse as CSS transform values (or plain numbers mixed
// with them). Each runs over the input grid with OPTION_SETS.
const TRANSFORM_RANGES = [
	// scale
	["1", "2 3"],
	["0", "1"],
	["1 1", "2 0.5"],
	["0.5", "1.5 2 2.5"],
	[1, "2"],
	["1", 2],
	[0, "2 3"],
	["-1", "1"],
	["100", "900"],
	["+1.5", "-.25"],
	["0", "1 2", "3 4 5"],
	// translate
	["0px 0px", "0px -150px"],
	["0px", "10px"],
	["0px", "10px 20px 30px"],
	["0%", "100%"],
	["0px 0%", "10px 50%"],
	["-5em", "+5em"],
	[".5px", "1.px"],
	["0vw", "100vw"],
	["1rem 2ch", "3rem 4ch"],
	["0px 0px 0px", "1px 2px 3px"],
	["10px", "10px"],
	["  0px   1px ", "2px 3px"],
	["1.23456789px", "9.87654321px"],
	["0px", "1000000.123456px"],
	["0px", "10px 10px", "20px"],
	["0px", "10px", "20px 20px 20px"],
	["0px", "10px 1%", "10px"],
	["5px", "-5px", "5px", "-5px"],
	// rotate
	["0deg", "360deg"],
	["0deg", "90deg"],
	["0rad", "3.14159rad"],
	["0turn", "1turn"],
	["0grad", "400grad"],
	["-45deg", "45deg", "0deg"],
	["x 0deg", "x 90deg"],
	["X 0deg", "Y 90deg"],
	["0deg", "y 90deg"],
	["x 0deg", "y 90deg"],
	["1 0 0 0deg", "0 1 1 180deg"],
	["2 2 2 10deg", "x 90deg"],
	["z 0deg", "x 90deg"],
	["5deg", "x 90deg"],
	["x 90deg", "0deg"],
	["x 90deg", "z 0deg"],
	["-0deg", "x 90deg"],
	["0deg 0deg", "90deg 180deg"],
	["0deg", "90deg 90deg 90deg"],
	["0deg", "x 90deg", "y 180deg"],
	["x 0deg", "0deg", "y 90deg"],
	["x 10deg", "0deg", "y 90deg"],
	["0deg", "0deg", "x 90deg"],
	["0deg", "5deg", "x 90deg"],
	["x 10deg", "5deg", "0deg"],
	["5deg", "0deg", "x 10deg"],
	["5deg", "0deg", "y 10deg"],
	["0deg", "x 0deg", "0deg"],
	["0deg", "10deg", "x 20deg", "0deg"],
	["0deg", "0deg", "0deg", "z 10deg"],
	["y 0deg", "0deg", "0deg", "10deg"],
	// transform-origin
	["left top", "right bottom"],
	["left", "right"],
	["center", "right bottom"],
	["top left", "bottom right"],
	["Left", "RIGHT TOP"],
	["left top 0px", "right bottom 10px"],
	["left", "0%"],
	["10%", "right top"],
	["left top 10px", "left"],
	["left", "right 10%"],
	["10% 20% 3px", "left"],
	["top center", "left"],
	["center left", "right"],
	["center top 5px", "left"],
	["top 10%", "bottom 90%"],
	["right 10px", "right 20px"],
	["center 10px", "center 20px"],
	["10px top", "20px bottom"],
	["left top 1em", "right bottom 2em"],
	["left 10% 10px", "left"],
	["center", "center"],
	["left", "center", "right"],
];

// Output ranges that only work with a given outputType.
const TYPED_RANGES = [
	["transform-origin", ["0px", "1px"]],
	["transform-origin", ["0%", "1%"]],
	["transform-origin", ["0px 0px 0px", "1px 1px 1px"]],
	["transform-origin", ["10px 20px", "30px 40px"]],
	["transform-origin", ["left", "right"]],
	["translate", ["0px", "10px 20px"]],
	["translate", ["0% 0%", "100% 50%"]],
	["rotate", ["0deg", "90deg"]],
	["rotate", ["x 0deg", "x 1deg"]],
	["scale", ["1", "2"]],
	["scale", [1, 2]],
	["scale", [1, "2"]],
	["scale", [[0], [1]]],
	["font-weight", [100, 900]],
	["font-weight", ["normal", "bold"]],
	["font-weight", ["bold", "normal"]],
	["font-weight", ["Bold", "NORMAL"]],
	["font-weight", [100, "bold"]],
	["font-weight", ["100", "900"]],
	["font-weight", ["1", "1000"]],
	["font-weight", [400, 700, 100]],
	["font-weight", ["1e2", "9e2"]],
	["font-weight", ["0x64", "900"]],
	["font-weight", ["  400", "900 "]],
	["font-weight", [1, 1000]],
	["font-weight", [550.5, 551]],
];

const TUPLE_RANGES = [
	[
		[0, 0.5],
		[1, 0.5],
	],
	[
		[0, 10],
		[1, 20],
	],
	[[1], [2]],
	[
		[0, 0, 0],
		[1, 2, 3],
		[-1, -2, -3],
	],
	[
		[5, -5],
		[5, -5],
	],
];

const NUMBER_RANGES = [
	[0, 1],
	[1, 2],
	[0, -1],
	[-1, 1],
	[0, 2, -2],
	[3, 3],
	[0.5, 4, 0.25],
	[-3, -3],
	[1e200, 1e200],
	[0, 1e200],
];

// Options applied to every numeric-like range: the four extrapolations on both
// sides, easing, both output modes and posterize.
const optionSets = (span) => [
	{},
	...EXTRAPOLATIONS.map((m) => ({ extrapolateLeft: m, extrapolateRight: m })),
	{ extrapolateLeft: "clamp", extrapolateRight: "extend" },
	{ easing: "quad" },
	{ easing: ["spring", { damping: 200 }] },
	{ output: "perceptual-scale" },
	{ output: "perceptual-scale", easing: ["out", "cubic"], extrapolateRight: "clamp" },
	{ output: "perceptual-scale", extrapolateLeft: "identity", extrapolateRight: "wrap" },
	{ output: "linear" },
	{ posterize: span / 7 },
	{ easing: "step1" },
];

const DISCRETE_RANGES = [
	["a", "b", "c"],
	["default", "ne-resize"],
	["red", "blue"],
	["", "x"],
	["0px 0px 0px 0px", "red"],
	["red", "1px"],
	["1px", "red"],
	["left left", "red"],
	["0PX", "red"],
	["1e2px", "2e2px"],
	["none", "none"],
	["calc(1px)", "calc(2px)"],
	["x 0px", "x 9px"],
	["0deg x", "90deg x"],
];

const BOOLEAN_RANGES = [
	[false, true],
	[true, false, true],
	[true, true],
];

// Discrete strings and booleans need Easing.step1; the other easings are
// recorded for their errors.
const discreteOptionSets = (span) => [
	{},
	{ easing: "step1" },
	...EXTRAPOLATIONS.map((m) => ({ easing: "step1", extrapolateLeft: m, extrapolateRight: m })),
	{ easing: "step1", posterize: span / 3 },
	{ easing: "step1", output: "perceptual-scale" },
	{ easing: "step0" },
	{ easing: ["in", "step1"] },
	{ easing: "linear" },
	{ easing: "step1", outputType: "scale" },
	{ easing: "step1", outputType: "rotate" },
	{ easing: "step1", outputType: "font-weight" },
	{ easing: "step1", outputType: "transform-origin" },
];

// Easings whose segment keeps moving past its end: a spring with allowTail,
// and plain functions flagged like it ("tail" spec).
const TAIL_CASES = [
	[
		[0, 30, 60],
		[0, 100, 0],
		[
			["spring", { allowTail: true, damping: 200, durationRestThreshold: 0.03 }],
			["spring", { allowTail: true, damping: 200, durationRestThreshold: 0.03 }],
		],
	],
	[
		[0, 30, 60],
		[0, 100, 0],
		[["spring", { allowTail: true }], "linear"],
	],
	[
		[0, 30, 60],
		[0, 100, 0],
		[["tail", "quad"], "linear"],
	],
	[
		[0, 30, 60],
		[0, 100, 0],
		["linear", ["tail", "quad"]],
	],
	[
		[0, 30, 60],
		[0, 100, 100],
		[["tail", "quad"], "linear"],
	],
	[
		[0, 30, 60],
		[0, 0, 100],
		[["tail", "quad"], "linear"],
	],
	[
		[0, 30, 60, 90],
		[0, 100, 0, 50],
		[["tail", "quad"], ["tail", "quad"], "linear"],
	],
	[
		[0, 30, 60, 90],
		[0, 100, 0, 50],
		[["tail", "quad"], "linear", ["tail", ["out", "cubic"]]],
	],
	[[0, 30, 60], [1, 2, 1], [["tail", "quad"], "linear"], { output: "perceptual-scale" }],
	[
		[0, 30, 60],
		["0px 1px", "100px 2px", "0px 0px"],
		[["tail", "quad"], "linear"],
	],
	[
		[0, 30, 60],
		["0deg", "x 90deg", "0deg"],
		[["tail", "quad"], "linear"],
	],
	[
		[0, 30, 60],
		[
			[0, 1],
			[100, 2],
			[0, 0],
		],
		[["tail", "quad"], "linear"],
	],
	[[0, 30, 60], [100, "bold", 100], [["tail", "quad"], "linear"], { outputType: "font-weight" }],
	[
		[0, 30, 60],
		["a", "b", "c"],
		[["tail", "quad"], "linear"],
	],
];

const TAIL_SINGLE = [
	[
		[0, 30, 60],
		[0, 100, 0],
		["tail", "quad"],
	],
	[
		[0, 30, 60],
		[0, 100, 0],
		["spring", { allowTail: true, damping: 200, durationRestThreshold: 0.03 }],
	],
	[
		[0, 30, 60],
		[0, 100, 0],
		["spring", { allowTail: "yes" }],
	],
];

export const recordInterpolateOutputs = ({ write, linspace, toRemotionOptions }) => {
	const cases = [];
	const push = (inputRange, outputRange, options, inputs = inputsAround(inputRange, linspace)) => {
		const real = toRemotionOptions(options);
		cases.push({
			inputRange,
			outputRange,
			options,
			inputs,
			results: inputs.map((x) => captureTyped(() => interpolate(x, inputRange, outputRange, real))),
		});
	};
	const span = (inputRange) => inputRange[inputRange.length - 1] - inputRange[0];

	for (const outputRange of [...TRANSFORM_RANGES, ...TUPLE_RANGES, ...NUMBER_RANGES]) {
		const inputRange = rangeFor(outputRange.length);
		for (const options of optionSets(span(inputRange))) push(inputRange, outputRange, options);
	}
	for (const [outputType, outputRange] of TYPED_RANGES) {
		const inputRange = rangeFor(outputRange.length);
		for (const options of optionSets(span(inputRange))) {
			push(inputRange, outputRange, { ...options, outputType });
		}
	}
	for (const outputRange of [...DISCRETE_RANGES, ...BOOLEAN_RANGES]) {
		const inputRange = rangeFor(outputRange.length);
		for (const options of discreteOptionSets(span(inputRange))) {
			push(inputRange, outputRange, options);
		}
	}
	// Single keyframes return their value as written, or normalised.
	for (const value of ["5px", " 5px ", "left", "1e2px", "red", true, [1, 2], "x 90deg", "1 2"]) {
		push([0], [value], {}, [-1, 0, 0.5]);
		push([0], [value], { output: "perceptual-scale" }, [0]);
	}
	push([0], ["bold"], { outputType: "font-weight" }, [0]);
	push([0], [-3], { output: "perceptual-scale" }, [0]);
	push([0], ["5px"], { outputType: "rotate" }, [0]);

	for (const [inputRange, outputRange, segments, extra] of TAIL_CASES) {
		const inputs = linspace(-15, 105, 24);
		for (const extrapolateRight of EXTRAPOLATIONS) {
			push(
				inputRange,
				outputRange,
				{ ...extra, extrapolateRight, easingSegments: segments },
				inputs,
			);
		}
		push(inputRange, outputRange, { ...extra, easingSegments: segments, posterize: 7 }, inputs);
	}
	for (const [inputRange, outputRange, easing] of TAIL_SINGLE) {
		push(inputRange, outputRange, { easing }, linspace(-15, 105, 24));
	}

	write(
		"interpolate-outputs",
		"interpolate() with string, boolean, tuple and font-weight outputs, output and outputType; values tagged as in record-interpolate-outputs.mjs",
		tag(cases),
	);

	const errorCases = [
		// Option validation and its order against the range checks.
		[0.5, [0, 1], [0, 1], { output: "nope" }],
		[0.5, [0, 1], ["0px", "1px"], { output: "nope", outputType: "nope" }],
		[0.5, [0, 1], ["0px", "1px"], { outputType: "nope" }],
		[0.5, [0, 1], [0, 1], { outputType: "" }],
		[0.5, [1, 0], ["a", "b"], { output: "nope" }],
		[0.5, [0, 1], ["a", "b", "c"], { output: "nope" }],
		[0.5, [0, 1], ["a", "b"], { posterize: 0 }],
		[0.5, [0, 1], ["a", "b"], { easingSegments: [] }],
		[0.5, [0, 1], ["a", "b"], { posterize: 0, output: "nope" }],
		[0.5, [0, 1], ["a", "b"], { easingSegments: [], output: "nope" }],
		[0.5, [0, 1], [Number.NaN, "1px"], {}],
		[0.5, [0, 1], ["1px", Number.NaN], {}],
		[0.5, [0, 1], [1, Number.NaN], { output: "perceptual-scale" }],
		[0.5, [0, 1], [Number.NaN, 1], { outputType: "font-weight" }],
		[0.5, [0, 1], [Number.POSITIVE_INFINITY, "bold"], { outputType: "font-weight" }],
		[0.5, [0, 1], [Number.NaN, true], { easing: "step1" }],
		[0.5, [0, 1], [Number.NaN, [1]], {}],
		[
			0.5,
			[0, 1],
			[
				[0, Number.POSITIVE_INFINITY],
				[1, 1],
			],
			{},
		],
		[
			0.5,
			[0, 1],
			[
				[0, Number.NaN],
				[1, 1],
			],
			{},
		],
		[0.5, [0, 1], ["x", "y"], { posterize: -1, easing: "step1" }],
		["0.5", [0, 1], ["0px", "1px"], {}],
		[undefined, [0, 1], ["0px", "1px"], {}],
		// Mixed kinds.
		[0.5, [0, 1], [0, "1px"], {}],
		[0.5, [0, 1], ["1px", 0], {}],
		[0.5, [0, 1], [0, "0deg"], {}],
		[0.5, [0, 1], [0, "left"], {}],
		[0.5, [0, 1], ["0deg", "1px"], {}],
		[0.5, [0, 1], ["0deg", "left"], {}],
		[0.5, [0, 1], ["left", "0deg"], {}],
		[0.5, [0, 1], ["left", "0"], {}],
		[0.5, [0, 1], ["0px", "0deg"], { easing: "step1" }],
		[0.5, [0, 1], ["0px", "10%"], {}],
		[0.5, [0, 1], ["0rem", "10vw"], {}],
		[0.5, [0, 1], ["0deg", "1turn"], {}],
		[0.5, [0, 1], ["0px 0px", "100% 100%"], {}],
		[0.5, [0, 1], ["left", "10px"], {}],
		[0.5, [0, 1], ["10px", "right top"], {}],
		[0.5, [0, 1], ["left top 1em", "left top 2px"], {}],
		[0.5, [0, 1, 3], ["0px", "10px 1%", "10px 1px"], {}],
		[0.5, [0, 1, 3], ["0px 1px", "10px", "10px 1%"], {}],
		[0.5, [0, 1], ["x 0deg", "0deg 0deg"], {}],
		[0.5, [0, 1], ["0deg 0deg", "y 0deg"], {}],
		// Malformed numeric strings.
		[0.5, [0, 1], ["0px 0", "10px 10px"], {}],
		[0.5, [0, 1], ["0 0px", "1 1px"], {}],
		[0.5, [0, 1], ["0deg 0px", "1deg 1px"], {}],
		[0.5, [0, 1], ["1 0deg", "2 1deg"], {}],
		[0.5, [0, 1], ["0px 0deg", "1px 1deg"], {}],
		[0.5, [0, 1], ["1 0 90deg", "1 0 90deg"], {}],
		[0.5, [0, 1], ["0px 0px 0px 0px", "1px 1px 1px 1px"], {}],
		[0.5, [0, 1], ["1 1 1 1", "2 2 2 2"], {}],
		[0.5, [0, 1], ["1 0 0 0", "1 0 0 1"], {}],
		[0.5, [0, 1], ["1 0 0 0deg", "1 0 0 90px"], {}],
		[0.5, [0, 1], ["0deg 0deg 0deg 0deg", "1deg 1deg 1deg 1deg"], {}],
		[0.5, [0, 1], ["0PX", "10PX"], {}],
		[0.5, [0, 1], ["0Q", "10Q"], {}],
		[0.5, [0, 1], ["0fr", "1fr"], {}],
		[0.5, [0, 1], ["0s", "1s"], {}],
		[0.5, [0, 1], ["0x", "1x"], {}],
		[0.5, [0, 1], ["left left", "right right"], {}],
		[0.5, [0, 1], ["top top", "left"], {}],
		[0.5, [0, 1], ["left top 0%", "left top 10%"], {}],
		[0.5, [0, 1], ["left top 0", "left top 10px"], {}],
		[0.5, [0, 1], ["left top 0px 0px", "left top 10px 0px"], {}],
		[0.5, [0, 1], ["10px left", "left"], {}],
		[0.5, [0, 1], ["center center center", "left"], {}],
		[0.5, [0, 1], ["left 0", "right"], {}],
		[0.5, [0, 1], ["left red", "right"], {}],
		[0.5, [0, 1], ["left", "right top bottom"], {}],
		[0.5, [0, 1], ["left 10px 10px", "left"], {}],
		[0.5, [0, 1], ["top 10px", "left"], {}],
		[0.5, [0, 1], ["right 10px", "left"], {}],
		[0.5, [0, 1], ["10px 10px 10px", "left"], {}],
		[0.5, [0, 1], ["1.5.5px", "1px"], {}],
		// outputType against the values.
		[0.5, [0, 1], [0, 1], { outputType: "translate" }],
		[0.5, [0, 1], [0, 1], { outputType: "rotate" }],
		[0.5, [0, 1], [0, 1], { outputType: "transform-origin" }],
		[
			0.5,
			[0, 1],
			[
				[0, 10],
				[1, 20],
			],
			{ outputType: "rotate" },
		],
		[
			0.5,
			[0, 1],
			[
				[0, 10],
				[1, 20],
			],
			{ outputType: "translate" },
		],
		[
			0.5,
			[0, 1],
			[
				[0, 10],
				[1, 20],
			],
			{ outputType: "transform-origin" },
		],
		[0.5, [0, 1], [[0], [1]], { outputType: "font-weight" }],
		[0.5, [0, 1], ["0px", "90px"], { outputType: "rotate" }],
		[0.5, [0, 1], ["0deg", "90deg"], { outputType: "translate" }],
		[0.5, [0, 1], ["0px", "2px"], { outputType: "scale" }],
		[0.5, [0, 1], ["left", "right"], { outputType: "scale" }],
		[0.5, [0, 1], ["left", "right"], { outputType: "translate" }],
		[0.5, [0, 1], ["1", "2"], { outputType: "translate" }],
		[0.5, [0, 1], ["1", "2"], { outputType: "rotate" }],
		[0.5, [0, 1], ["1 0 0 0deg", "1 0 0 1deg"], { outputType: "scale" }],
		[0.5, [0, 1], [1, "2px"], { outputType: "translate" }],
		[0.5, [0, 1], ["0 0", "1 1"], { outputType: "transform-origin" }],
		[0.5, [0, 1], ["0% 0% 0%", "1% 1% 1%"], { outputType: "transform-origin" }],
		[0.5, [0, 1], ["0deg", "1deg"], { outputType: "transform-origin" }],
		[0.5, [0, 1], ["red", "blue"], { outputType: "transform-origin", easing: "step1" }],
		[0.5, [0, 1], ["normal", "bold"], { outputType: "scale" }],
		[0.5, [0, 1], ["lighter", "bolder"], { outputType: "font-weight" }],
		[0.5, [0, 1], [0, 900], { outputType: "font-weight" }],
		[0.5, [0, 1], [1001, 1000], { outputType: "font-weight" }],
		[0.5, [0, 1], [0.5, 1000], { outputType: "font-weight" }],
		[0.5, [0, 1], ["0.5", "1000"], { outputType: "font-weight" }],
		[0.5, [0, 1], ["100px", "1000"], { outputType: "font-weight" }],
		[0.5, [0, 1], [" bold ", "normal"], { outputType: "font-weight" }],
		[0.5, [0, 1], ["", "normal"], { outputType: "font-weight" }],
		[0.5, [0, 1], ["bold", true], { outputType: "font-weight" }],
		[0.5, [0, 1], ["100 200", "1"], { outputType: "font-weight" }],
		[0.5, [0, 1], ["1px", "2px"], { outputType: "font-weight" }],
		[0.5, [0, 1], [true, false], { outputType: "scale", easing: "step1" }],
		// Tuples, booleans and unsupported values.
		[
			0.5,
			[0, 1],
			[
				[0, 0],
				[1, 2, 3],
			],
			{},
		],
		[
			0.5,
			[0, 1],
			[
				[0, 0],
				[1, "2"],
			],
			{},
		],
		[0.5, [0, 1], [[], []], {}],
		[0.5, [0, 1], [1, [1]], {}],
		[0.5, [0, 1], [[1], 1], {}],
		[0.5, [0, 1], [[1], "red"], { easing: "step1" }],
		[0.5, [0, 1], ["0px", null], {}],
		[0.5, [0, 1], [null, 1], {}],
		[0.5, [0, 1], [{}, {}], {}],
		[0.5, [0, 1], [undefined, 1], {}],
		[0.5, [0, 1], ["red", 1], { easing: "step1" }],
		[0.5, [0, 1], [1, "red"], { easing: "step1" }],
		[0.5, [0, 1], ["red", true], { easing: "step1" }],
		[0.5, [0, 1], [true, 0], { easing: "step1" }],
		[0.5, [0, 1], [1, true], {}],
		[0.5, [0, 1], [true, "a"], { easing: "step1" }],
		[0.5, [0, 1], [true, false], {}],
		[0.5, [0, 1], ["red", "blue"], {}],
		[0.5, [0, 1], ["red", "blue"], { extrapolateLeft: "identity" }],
		[-5, [0, 1, 3], ["a", "b", "c"], { easing: "step1", extrapolateLeft: "identity" }],
		[5, [0, 1, 3], ["a", "b", "c"], { easing: "step1", extrapolateRight: "identity" }],
		[2, [0, 1], [false, true], { easing: "step1", extrapolateRight: "identity" }],
		[-2, [0, 1], [false, true], { easing: "step1", extrapolateLeft: "identity" }],
		[1.5, [0, 1, 2], ["a", "b", "c"], { easingSegments: ["step1", "linear"] }],
		[1.5, [0, 1, 2], ["a", "b", "c"], { easingSegments: ["step1", "step1"] }],
		[0.5, [0, 1], ["red", "blue"], { extrapolateLeft: "nope", easing: "step1" }],
		[-1, [0, 1], ["0px", "1px"], { extrapolateLeft: "nope" }],
	];
	write(
		"interpolate-outputs-errors",
		"interpolate() validation of non-numeric outputs: each case is [input, inputRange, outputRange, options] with out or error; values tagged",
		tag(
			errorCases.map(([input, inputRange, outputRange, options]) => ({
				input,
				inputRange,
				outputRange,
				options,
				...captureTyped(() =>
					interpolate(input, inputRange, outputRange, toRemotionOptions(options)),
				),
			})),
		),
	);
};
