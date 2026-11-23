// The transform builders, makeTransform() and interpolateStyles() against the outputs of the
// published @remotion/animation-utils (tools/oracle-features/record-animation-utils.mjs).
import { compareFailure, failureOf } from "@motiojs/testing/oracle-errors";
import { describe, expect, it } from "vitest";
import styleFixture from "./__oracle__/interpolate-styles.json" with { type: "json" };
import transformFixture from "./__oracle__/transforms.json" with { type: "json" };
import * as api from "./index.js";

type Outcome = { out?: unknown; error?: number };
type Message = { type: string; message: string };

const EASINGS: Record<string, (t: number) => number> = {
	quad: (t) => t * t,
	sqrt: (t) => Math.sqrt(t),
	linear: (t) => t,
};

/** Rebuilds a value tagged by the recorder. */
const untag = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(untag);
	if (value !== null && typeof value === "object") {
		if ("$u" in value) return undefined;
		if ("$n" in value) return Number((value as { $n: string }).$n);
		if ("$fn" in value) return EASINGS[(value as { $fn: string }).$fn];
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, untag(v)]));
	}
	return value;
};

/** Options of interpolateStyles() that a failure message should name when the recorded one does. */
const STYLE_OPTIONS = [
	"input",
	"inputRange",
	"outputRange",
	"outputStylesRange",
	"easing",
	"posterize",
];

/**
 * Asserts that `fn` does what the recorded call did: returns a strictly equal value, or fails with
 * the same error class and a message of Motio's own that names the same options.
 */
const expectRecorded = (
	fn: () => unknown,
	recorded: Outcome,
	messages: Message[],
	label: string,
	names: readonly string[] = [],
) => {
	if (recorded.error === undefined) {
		expect({ out: fn() }, label).toStrictEqual({ out: untag(recorded.out) });
		return;
	}
	const message = messages[recorded.error] as Message;
	const { threw, error } = failureOf(fn);
	expect(threw, `${label}: should throw`).toBe(true);
	expect(
		compareFailure(error, { error: message.message, errorType: message.type }, names),
		label,
	).toBeUndefined();
};

const callable = api as unknown as Record<string, (...args: unknown[]) => unknown>;

describe("transform builders equal @remotion/animation-utils", () => {
	const [header, ...cases] = transformFixture.cases as unknown as [
		{ messages: Message[] },
		...Array<[string, unknown[], Outcome]>,
	];
	const byFunction = new Map<string, Array<[unknown[], Outcome]>>();
	for (const [fn, args, recorded] of cases) {
		byFunction.set(fn, [...(byFunction.get(fn) ?? []), [args, recorded]]);
	}
	for (const [fn, list] of byFunction) {
		it(`${fn} over ${list.length} argument lists`, () => {
			for (const [args, recorded] of list) {
				const values = untag(args) as unknown[];
				const label = `${fn}(${JSON.stringify(args)})`;
				expectRecorded(() => callable[fn]?.(...values), recorded, header.messages, label);
			}
		});
	}
});

describe("interpolateStyles equals @remotion/animation-utils", () => {
	const [header, ...cases] = styleFixture.cases as unknown as [
		{ messages: Message[] },
		...Array<[unknown[], Outcome]>,
	];
	it(`over ${cases.length} calls`, () => {
		for (const [args, recorded] of cases) {
			const values = untag(args) as Parameters<typeof api.interpolateStyles>;
			expectRecorded(
				() => api.interpolateStyles(...values),
				recorded,
				header.messages,
				JSON.stringify(args),
				STYLE_OPTIONS,
			);
		}
	});

	it("matches the example of the docs", () => {
		const style = api.interpolateStyles(
			15,
			[0, 30, 60],
			[
				{ opacity: 0, transform: api.makeTransform([api.translateY(-50)]) },
				{ opacity: 1, transform: api.makeTransform([api.translateY(0)]) },
				{ opacity: 0, transform: api.makeTransform([api.translateY(50)]) },
			],
		);
		expect(style).toEqual({ opacity: 0.5, transform: "translateY(-25px)" });
	});
});
