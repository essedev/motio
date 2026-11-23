import { Easing, type EasingFunction } from "@motiojs/core";
import { describe, expect, it } from "vitest";
import cutEvolveFixture from "./__oracle__/cut-evolve.json" with { type: "json" };
import extendFixture from "./__oracle__/extend-viewbox.json" with { type: "json" };
import { DeepTracker, deepError, type Outcome, outcomeOf } from "./__oracle__/fixtures.js";
import interpolateFixture from "./__oracle__/interpolate.json" with { type: "json" };
import keyframesFixture from "./__oracle__/interpolate-keyframes.json" with { type: "json" };
import measureFixture from "./__oracle__/measure.json" with { type: "json" };
import parseFixture from "./__oracle__/parse.json" with { type: "json" };
import transformFixture from "./__oracle__/transform.json" with { type: "json" };
import warpFixture from "./__oracle__/warp.json" with { type: "json" };
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
	type InterpolatePathsOptions,
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
	type WarpPathFn,
	warpPath,
} from "./index.js";

// Tolerances. Every function reproduces Remotion's arithmetic step by step,
// so results are expected to be bit-identical (tolerance 0), with one
// exception: cutPath finds the curve parameter of a cut by an iterative
// search whose input differs from Remotion's in the last bit in rare cases,
// measured at most 8e-15 relative; 1e-12 leaves room for that only.
const EXACT = 0;
const CUT_TOLERANCE = 1e-12;
const FRACTIONS = [0, 0.001, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999, 1, 1.01];
// Scales recorded by the oracle for extendViewBox (3.14159 is a recorded
// input, not an approximation of pi).
// biome-ignore lint/suspicious/noApproximativeNumericConstant: recorded oracle input
const VIEWBOX_SCALES = [2, 0.5, 1, 1.37, 3.14159, 0.001, -1];

const check = (tracker: DeepTracker, tolerance: number) => {
	expect(tracker.max, tracker.worst).toBeLessThanOrEqual(tolerance);
};

describe("parsePath and serializeInstructions against the Remotion oracle", () => {
	type ParseCase = { input: string; parsed: Outcome<unknown>; serialized: string | null };
	it(`matches ${parseFixture.cases.length} strings, failures included`, () => {
		const tracker = new DeepTracker();
		for (const c of parseFixture.cases as ParseCase[]) {
			const parsed = outcomeOf(() => parsePath(c.input));
			tracker.add(parsed, c.parsed, () => `parsePath(${JSON.stringify(c.input)})`);
			if (parsed.out !== undefined) {
				tracker.add(serializeInstructions(parsed.out), c.serialized, () => c.input);
			}
		}
		check(tracker, EXACT);
	});
});

describe("path transforms against the Remotion oracle", () => {
	type TransformCase = { path: string } & Record<string, Outcome<unknown>>;
	it(`matches ${transformFixture.cases.length} paths for every transform`, () => {
		const tracker = new DeepTracker();
		for (const c of transformFixture.cases as TransformCase[]) {
			const p = c.path;
			const actual: Record<string, Outcome<unknown>> = {
				normalize: outcomeOf(() => normalizePath(p)),
				reduce: outcomeOf(() => serializeInstructions(reduceInstructions(parsePath(p)))),
				reverse: outcomeOf(() => reversePath(p)),
				translate: outcomeOf(() => [translatePath(p, 10, -5.5), translatePath(p, 0.1, 0.2)]),
				scale: outcomeOf(() => [scalePath(p, 2, 0.5), scalePath(p, -1, 3.3)]),
				boundingBox: outcomeOf(() => getBoundingBox(p)),
				reset: outcomeOf(() => resetPath(p)),
				center: outcomeOf(() => [centerPath(p), centerPath(p, { x: 33.3, y: -7 })]),
				subpaths: outcomeOf(() => getSubpaths(p)),
			};
			for (const [name, outcome] of Object.entries(actual)) {
				tracker.add(outcome, c[name], () => `${name}(${JSON.stringify(p)})`);
			}
		}
		check(tracker, EXACT);
	});
});

describe("path measurement against the Remotion oracle", () => {
	type MeasureCase = {
		path: string;
		length: Outcome<number>;
		points: Outcome<unknown>[] | null;
		tangents: Outcome<unknown>[] | null;
		indices: Outcome<unknown>[] | null;
		negative: Outcome<unknown>;
	};
	it(`matches length, points, tangents and indices on ${measureFixture.cases.length} paths`, () => {
		const tracker = new DeepTracker();
		for (const c of measureFixture.cases as MeasureCase[]) {
			const length = outcomeOf(() => getLength(c.path));
			tracker.add(length, c.length, () => `getLength(${c.path})`);
			const total = length.out;
			if (total === undefined) continue;
			const at = (fn: (l: number) => unknown) =>
				FRACTIONS.map((f) => outcomeOf(() => fn(total * f)));
			tracker.add(
				at((l) => getPointAtLength(c.path, l)),
				c.points,
				() => `points ${c.path}`,
			);
			tracker.add(
				at((l) => getTangentAtLength(c.path, l)),
				c.tangents,
				() => `tangents ${c.path}`,
			);
			tracker.add(
				at((l) => getInstructionIndexAtLength(c.path, l)),
				c.indices,
				() => `indices ${c.path}`,
			);
			tracker.add(
				outcomeOf(() => getPointAtLength(c.path, -5)),
				c.negative,
				() => `negative ${c.path}`,
			);
		}
		check(tracker, EXACT);
	});

	type CutCase = { path: string; cut: Outcome<string>[] | null; evolve: Outcome<unknown>[] };
	it(`matches cutPath within ${CUT_TOLERANCE} and evolvePath exactly`, () => {
		const cut = new DeepTracker();
		const evolve = new DeepTracker();
		for (const c of cutEvolveFixture.cases as CutCase[]) {
			const length = outcomeOf(() => getLength(c.path)).out;
			if (length !== undefined) {
				cut.add(
					[-1, ...FRACTIONS].map((f) => outcomeOf(() => cutPath(c.path, length * f))),
					c.cut,
					() => `cutPath(${c.path})`,
				);
			}
			evolve.add(
				[0, 1e-9, 0.1, 0.3, 0.5, 0.7, 1, 1.5, -0.5].map((p) =>
					outcomeOf(() => evolvePath(p, c.path)),
				),
				c.evolve,
				() => `evolvePath(${c.path})`,
			);
		}
		check(cut, CUT_TOLERANCE);
		check(evolve, EXACT);
	});
});

describe("path interpolation against the Remotion oracle", () => {
	const VALUES = [0, 0.3, -0.4, 1.7, 1];
	type InterpolateCase = {
		a: string;
		b: string;
		path: Outcome<string>[];
		paths: Outcome<string>[];
	};

	// Known divergence (COMPAT.md): with a drawing command right after a close
	// (no move in between), or a path that does not start with a move,
	// Remotion sometimes fails with a TypeError or another message where Motio
	// interpolates or reports differently. Everything else must be identical.
	const irregular = (path: string): boolean => {
		const reduced = outcomeOf(() => reduceInstructions(parsePath(path))).out;
		if (reduced === undefined) return false;
		if (reduced[0]?.type !== "M") return true;
		return reduced.some(
			(i, k) => i.type === "Z" && reduced[k + 1] !== undefined && reduced[k + 1]?.type !== "M",
		);
	};

	const compareInterpolation = (
		name: "path" | "paths",
		run: (v: number, c: InterpolateCase) => string,
	) => {
		const tracker = new DeepTracker();
		let known = 0;
		let total = 0;
		for (const c of interpolateFixture.cases as InterpolateCase[]) {
			VALUES.forEach((v, i) => {
				total++;
				const expected = c[name][i] as Outcome<string>;
				const actual = outcomeOf(() => run(v, c));
				if (deepError(actual, expected) !== 0 && (irregular(c.a) || irregular(c.b))) {
					known++;
					return;
				}
				tracker.add(actual, expected, () => `${name}(${v}, ${c.a} | ${c.b})`);
			});
		}
		check(tracker, EXACT);
		expect(known / total).toBeLessThan(0.05);
	};

	it("matches interpolatePath, failures included", () => {
		compareInterpolation("path", (v, c) => interpolatePath(v, c.a, c.b));
	});

	it("matches interpolatePaths, failures included", () => {
		compareInterpolation("paths", (v, c) => interpolatePaths(v, [0, 1], [c.a, c.b]));
	});

	type EasingSpec = string | (string | number | EasingSpec)[];
	const buildEasing = (spec: EasingSpec): EasingFunction => {
		if (typeof spec === "string")
			return (Easing as unknown as Record<string, EasingFunction>)[spec] as EasingFunction;
		const [name, ...args] = spec;
		if (name === "bezier") {
			const [x1, y1, x2, y2] = args as [number, number, number, number];
			return Easing.bezier(x1, y1, x2, y2);
		}
		return Easing[name as "in" | "out" | "inOut"](buildEasing(args[0] as EasingSpec));
	};
	type KeyframeCase = {
		options: {
			easing?: EasingSpec;
			extrapolateLeft?: string;
			extrapolateRight?: string;
			posterize?: number;
		};
		inputRange: number[];
		outputRange: string[];
		inputs: number[];
		out: Outcome<string>[];
	};
	it("matches interpolatePaths keyframes, easing, extrapolation and posterize", () => {
		const tracker = new DeepTracker();
		for (const c of keyframesFixture.cases as KeyframeCase[]) {
			const options: Record<string, unknown> = {};
			if (c.options.easing !== undefined) options.easing = buildEasing(c.options.easing);
			if (c.options.extrapolateLeft !== undefined)
				options.extrapolateLeft = c.options.extrapolateLeft;
			if (c.options.extrapolateRight !== undefined)
				options.extrapolateRight = c.options.extrapolateRight;
			if (c.options.posterize !== undefined) options.posterize = c.options.posterize;
			tracker.add(
				c.inputs.map((x) =>
					outcomeOf(() =>
						interpolatePaths(x, c.inputRange, c.outputRange, options as InterpolatePathsOptions),
					),
				),
				c.out,
				() => JSON.stringify(c.options),
			);
		}
		check(tracker, EXACT);
	});
});

describe("warpPath and extendViewBox against the Remotion oracle", () => {
	const WARPS: Record<string, WarpPathFn> = {
		sine: ({ x, y }) => ({ x: x + Math.sin(y / 4) * 5, y }),
		shear: ({ x, y }) => ({ x: x * 1.5 - y * 0.25, y: y + Math.cos(x / 10) * 3 }),
		identity: (p) => p,
	};
	type WarpCase = {
		path: string;
		sine: Outcome<string>;
		shear: Outcome<string>;
		identity: Outcome<string> | null;
	};
	it(`matches ${warpFixture.cases.length} paths with three warps`, () => {
		const tracker = new DeepTracker();
		for (const c of warpFixture.cases as WarpCase[]) {
			tracker.add(
				outcomeOf(() => warpPath(c.path, WARPS.sine as WarpPathFn, { interpolationThreshold: 25 })),
				c.sine,
				() => `sine ${c.path}`,
			);
			tracker.add(
				outcomeOf(() =>
					warpPath(c.path, WARPS.shear as WarpPathFn, { interpolationThreshold: 40 }),
				),
				c.shear,
				() => `shear ${c.path}`,
			);
			if (c.identity !== null) {
				tracker.add(
					outcomeOf(() => warpPath(c.path, WARPS.identity as WarpPathFn)),
					c.identity,
					() => `identity ${c.path}`,
				);
			}
		}
		check(tracker, EXACT);
	});

	it(`matches extendViewBox on ${extendFixture.cases.length} viewBoxes`, () => {
		const tracker = new DeepTracker();
		for (const c of extendFixture.cases as { viewBox: string; out: Outcome<string>[] }[]) {
			tracker.add(
				VIEWBOX_SCALES.map((s) => outcomeOf(() => extendViewBox(c.viewBox, s))),
				c.out,
				() => c.viewBox,
			);
		}
		check(tracker, EXACT);
	});
});
