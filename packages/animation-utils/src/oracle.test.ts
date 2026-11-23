// The transform builders, makeTransform() and interpolateStyles() against the outputs of the
// published @remotion/animation-utils (tools/oracle-features/record-animation-utils.mjs).
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

/** Runs fn and describes the result as the recorder did. */
const outcome = (fn: () => unknown): { out: unknown } | { error: Message } => {
	try {
		return { out: fn() };
	} catch (e) {
		const error = e as Error;
		return { error: { type: error.constructor.name, message: error.message } };
	}
};

const expected = (recorded: Outcome, messages: Message[]) =>
	recorded.error === undefined
		? { out: untag(recorded.out) }
		: { error: messages[recorded.error] as Message };

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
				expect(
					outcome(() => callable[fn]?.(...values)),
					label,
				).toStrictEqual(expected(recorded, header.messages));
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
			expect(
				outcome(() => api.interpolateStyles(...values)),
				JSON.stringify(args),
			).toStrictEqual(expected(recorded, header.messages));
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
