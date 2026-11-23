// Records @remotion/animation-utils over deterministic grids: every transform builder over
// argument lists from a pool (outputs and error messages), the unit-string checks over short
// generated strings, and interpolateStyles() over pairs of CSS values, random multi-token
// values, multi-keyframe styles, options and invalid calls. Called by record.mjs; public API
// only.

import * as A from "@remotion/animation-utils";
import { makeRng, writeFixture } from "./lib.mjs";

// Values are tagged so JSON keeps what it cannot hold: { $u: true } is undefined, { $n } a
// non-finite number or -0, { $fn } a named easing function; other objects are plain objects.
const tag = (value) => {
	if (value === undefined) return { $u: true };
	if (typeof value === "number") {
		if (Number.isNaN(value) || !Number.isFinite(value) || Object.is(value, -0)) {
			return { $n: String(Object.is(value, -0) ? "-0" : value) };
		}
		return value;
	}
	if (typeof value === "function") return { $fn: value.easingName };
	if (Array.isArray(value)) return value.map(tag);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, tag(v)]));
	}
	return value;
};

const named = (name, fn) => Object.assign(fn, { easingName: name });
const EASINGS = {
	quad: named("quad", (t) => t * t),
	sqrt: named("sqrt", (t) => Math.sqrt(t)),
	linear: named("linear", (t) => t),
};

/** Runs fn; outputs are tagged, errors are an index into the shared message table. */
const recorder = () => {
	const messages = [];
	const index = new Map();
	const run = (fn) => {
		try {
			return { out: tag(fn()) };
		} catch (e) {
			const key = `${e.constructor.name}: ${e.message}`;
			if (!index.has(key)) {
				index.set(key, messages.length);
				messages.push({ type: e.constructor.name, message: e.message });
			}
			return { error: index.get(key) };
		}
	};
	return { messages, run };
};

// A plain copy of the namespace, so builders can be looked up by name.
const api = { ...A };
const TRANSFORMS = Object.keys(api).filter(
	(k) => !["interpolateStyles", "makeTransform"].includes(k),
);
const POOL = [1, -2.5, 0, Number.NaN, "10px", "45deg", "abc", "%", undefined, null, true];

function* combos(pool, n) {
	if (n === 0) {
		yield [];
		return;
	}
	for (const c of combos(pool, n - 1)) for (const v of pool) yield [...c, v];
}

const recordTransforms = () => {
	const { messages, run } = recorder();
	const cases = [];
	for (const fn of TRANSFORMS) {
		// Three arguments for the overloaded and multi-argument builders, two for the rest.
		const multi = ["translate", "skew", "translate3d", "rotate3d", "scale", "scale3d"];
		const maxLength = multi.includes(fn) ? 3 : 2;
		for (let n = 0; n <= maxLength; n++) {
			for (const args of combos(POOL, n)) cases.push([fn, tag(args), run(() => api[fn](...args))]);
		}
	}
	const longer = [
		["translate", [1, "px", 2, "%"]],
		["translate", [1, 2, 3, true]],
		["translate", [1, "px", Number.NaN, "px"]],
		["translate", ["1px", "px", 2, "px"]],
		["skew", [1, "rad", 2, "turn"]],
		["skew", [1, "x", 1, "y"]],
		["skew", [1, "rad", Number.NaN, "deg"]],
		["translate3d", [1, "px", 2, "px", 3, "px"]],
		["translate3d", [1, 2, 3, 4, 5, 6]],
		["translate3d", [1, "%", Number.NaN, "px", 3, "px"]],
		["translate3d", ["1", 2, 3, 4, 5, 6]],
		["translate3d", [1, "px", 2, "px", 3]],
		["translate3d", [1, "px", 2, "px", 3, "px", 4]],
		["rotate3d", [1, 0, 0, 45]],
		["rotate3d", [1, 0, 0, 45, "rad"]],
		["rotate3d", [1, 0, 0, "45deg", "rad"]],
		["rotate3d", [1, 0, 0, "45px"]],
		["rotate3d", [1, 0, 0, Number.POSITIVE_INFINITY]],
		["matrix", [1, 0, 0, 1, 50, 50]],
		["matrix", [1, 0, 0, 1, 50, "6"]],
		["matrix", [1, 0, 0, 1, Number.NaN, 2]],
		["matrix3d", Array.from({ length: 16 }, (_, i) => i / 2)],
		["matrix3d", [...Array.from({ length: 15 }, () => 1), Number.NaN]],
		["matrix3d", Array.from({ length: 15 }, () => 1)],
		["matrix3d", Array.from({ length: 17 }, () => 1)],
		["scale3d", [2, 3, 4]],
		["scale", [2, 3, 4]],
		["perspective", [100]],
		["perspective", [1, "em"]],
	];
	for (const [fn, args] of longer) cases.push([fn, tag(args), run(() => api[fn](...args))]);
	// The unit-string checks over every string of up to 3 characters from this alphabet.
	const chars = ["1", ".", "-", "e", " ", "p", "x", "%", "d", "g", "Q", "t"];
	const strings = [];
	for (let n = 1; n <= 3; n++) for (const c of combos(chars, n)) strings.push(c.join(""));
	strings.push("10px", "10 px", " 10px", "10px ", "10PX", "1e3px", "+5px", "Infinitypx", "10Q");
	strings.push("10vmax", "10cqmin", "45turn", "10grad", "1.5e-3%", "x10px", "10%%", "1eQ");
	for (const s of strings) {
		for (const fn of ["translateX", "rotateX", "perspective", "translateZ"]) {
			cases.push([fn, [s], run(() => api[fn](s))]);
		}
	}
	for (const transforms of [[], [A.rotate(45), A.translate(50, 50)], ["a", "b", "c"], "x", null]) {
		cases.push(["makeTransform", [tag(transforms)], run(() => A.makeTransform(transforms))]);
	}
	writeFixture(
		"animation-utils",
		"@remotion/animation-utils",
		"transforms",
		"Transform builders and makeTransform: [function, tagged args, {out} or {error: message index}]",
		[{ messages }, ...cases],
	);
};

const VALUES = [
	0,
	1,
	-2.5,
	10,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	"0",
	"10",
	"1.5",
	"-3",
	"",
	" ",
	"0px",
	"10px",
	"-5px",
	"2.5px",
	"10%",
	"0%",
	"5em",
	"10PX",
	"1e2px",
	".5px",
	"+5px",
	"10.px",
	"red",
	"blue",
	"#fff",
	"#00000080",
	"rgba(0,0,0,0.5)",
	"rgb(1, 2, 3)",
	"hsl(120, 100%, 50%)",
	"rgb(1 2 3)",
	"transparent",
	"currentColor",
	"RED",
	"oklch(0.5 0.1 120)",
	"auto",
	"none",
	"solid",
	"translateX(0px)",
	"translateX(10px)",
	"translateX(10%)",
	"translateY(4px)",
	"translate(1px, 2px)",
	"translate(3px,4px)",
	"translate(5px)",
	"scale(1)",
	"scale(2, 3)",
	"rotate(0deg)",
	"rotate(1turn)",
	"blur(0px)",
	"blur(4px)",
	"calc(1px)",
	"calc(1px + 2%)",
	"url(a)",
	"url(b)",
	"drop-shadow(1px 1px red)",
	"0px 10px",
	"5px 5%",
	"1px solid red",
	"2px dashed blue",
	"0px 0px red, 1px 1px blue",
	"translateX(0px) rotate(0deg)",
	"translateX(10px) rotate(90deg)",
	"brightness(1.5)",
	"matrix(1, 0, 0, 1, 0, 0)",
	"foo(1px, 2px)",
	"f(,1px)",
	"f(1px,)",
	"f( )",
	"f()",
	"f(g(1px))",
	"a(1)b",
	"0 0",
	"1 2",
	null,
	undefined,
	true,
	{},
];
const PIECES = [
	"0",
	"10",
	"-3",
	"2.5",
	"0px",
	"12px",
	"-4px",
	"50%",
	"1em",
	"1e2px",
	"x",
	"solid",
	"red",
	"#0f0",
	"rgba(1,2,3,0.5)",
	"blue,",
	"translateX(4px)",
	"translateX(0%)",
	"scale(1, 2)",
	"rotate(45deg)",
	"blur(2px)",
	"url(a)",
	"drop-shadow(red)",
	"f(1px,red)",
	"f(2px,red)",
	"f(a, 1px)",
	"f(rgba(0,0,0,1))",
	"f(g(1px))",
	"f()",
	"f( )",
	"(1px)",
	"f(1px",
	"1px)",
	"f(1px)(2px)",
	"a(1)b",
	"0deg",
	"1turn",
	"10PX",
	"5Px",
	"-0",
	"007px",
	"1.50px",
];

const recordInterpolateStyles = () => {
	const { messages, run } = recorder();
	const cases = [];
	const call = (input, range, styles, options) => {
		const args = options === undefined ? [input, range, styles] : [input, range, styles, options];
		cases.push([tag(args), run(() => A.interpolateStyles(...args))]);
	};
	for (const a of VALUES) for (const b of VALUES) call(0.5, [0, 1], [{ v: a }, { v: b }]);
	const rng = makeRng(545);
	for (let i = 0; i < 800; i++) {
		const a = VALUES[Math.floor(rng() * VALUES.length)];
		const b = VALUES[Math.floor(rng() * VALUES.length)];
		call(1.5, [0, 1], [{ v: a }, { v: b }]);
	}
	const pick = (list) => list[Math.floor(rng() * list.length)];
	const value = () =>
		Array.from({ length: 1 + Math.floor(rng() * 3) }, () => pick(PIECES)).join(pick([" ", "  "]));
	for (let i = 0; i < 2500; i++) {
		const a = value();
		const b = rng() < 0.3 ? a : value();
		const options =
			rng() < 0.5
				? undefined
				: {
						easing: pick([undefined, EASINGS.quad, EASINGS.sqrt]),
						extrapolateLeft: pick([undefined, "clamp", "identity", "wrap", "extend"]),
						extrapolateRight: pick([undefined, "clamp", "identity", "wrap"]),
						posterize: pick([undefined, undefined, 0.25]),
					};
		call(pick([0, 0.5, 1, 1.5, -0.5, 0.25]), [0, 1], [{ v: a }, { v: b }], options);
	}
	const STYLES = [
		{ a: 0, b: "10px" },
		{ a: 10 },
		{ b: "20px", c: "red" },
		{ a: 5, b: "0px", c: "blue" },
		{},
		{ a: "1", c: "#fff" },
	];
	for (let i = 0; i < 1000; i++) {
		const n = 2 + Math.floor(rng() * 3);
		const range = [];
		for (let k = 0; k < n; k++) range.push(k === 0 ? 0 : range[k - 1] + pick([1, 2]));
		const styles = Array.from({ length: n }, () => pick(STYLES));
		const easing = pick([
			undefined,
			EASINGS.quad,
			Array.from({ length: n - 1 }, () => pick([EASINGS.linear, EASINGS.quad])),
			[EASINGS.linear],
		]);
		call(pick([-1, 0, 0.5, 1, 1.5, 2, 3, 4.5, 10]), range, styles, easing ? { easing } : undefined);
	}
	const invalid = [
		[0.5, [0], [{}]],
		[0.5, [], []],
		[0.5, [0, 1], [{}]],
		[0.5, [1, 0], [{}, {}]],
		[0.5, [0, 0], [{}, {}]],
		[0.5, [0, Number.NaN], [{}, {}]],
		["x", [0, 1], [{ a: 1 }, { a: 2 }]],
		["x", [0, 1], [{}, {}]],
		[undefined, [0, 1], [{}, {}]],
		[undefined, [0], [{}]],
		[null, [0, 1], [{}, {}]],
		[null, [0, 1], [{ a: 1 }, { a: 2 }]],
		[Number.NaN, [0, 1], [{ a: 1 }, { a: 2 }]],
		[0.5, [0, 1], [{ a: 1 }, { a: 2 }], { posterize: 0 }],
		[0.5, [0, 1], [{}, {}], { posterize: -1 }],
		[0.5, [0, 1], [{}, {}], { posterize: null }],
		[0.5, [0, 1], [{}, {}], { posterize: -1, easing: [] }],
		[0.5, [1, 0], [{}, {}], { easing: [] }],
		[0.5, [0, 1], [{ a: 1 }, { a: 2 }], { easing: [] }],
		[0.5, [0, 1, 2], [{ a: 0 }, { a: 1 }, { a: 2 }], { easing: [EASINGS.quad] }],
		[0.5, [0, 1], [{ a: "red" }, { a: "blue" }], { easing: [EASINGS.quad] }],
		[0.5, [0, 1], [{ a: 1 }, { a: 2 }], { extrapolateRight: "nope" }],
		[0.5, [0, Number.POSITIVE_INFINITY], [{ a: 1 }, { a: 2 }]],
		[0.5, [0, 1, 1], [{}, {}, {}]],
	];
	for (const [input, range, styles, options] of invalid) call(input, range, styles, options);
	writeFixture(
		"animation-utils",
		"@remotion/animation-utils",
		"interpolate-styles",
		"interpolateStyles(): [tagged args, {out} or {error: message index}]",
		[{ messages }, ...cases],
	);
};

export const recordAnimationUtils = () => {
	recordTransforms();
	recordInterpolateStyles();
};
