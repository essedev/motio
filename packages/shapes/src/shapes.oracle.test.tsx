import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import componentsFixture from "./__oracle__/components.json" with { type: "json" };
import { DeepTracker, errorOf, type Outcome, outcomeOf } from "./__oracle__/fixtures.js";
import makeFixture from "./__oracle__/make.json" with { type: "json" };
import * as shapes from "./index.js";

// Tolerances, relative. The shapes are built from the same formulas as
// Remotion's, but the order of a few floating-point operations differs
// (measured worst case 4.3e-14): 1e-12. Polygons and stars are placed by
// their bounding box, which Remotion computes slightly differently around
// curves (measured worst case 8.5e-12): 1e-10. One divergence is known and
// excluded: polygons and stars with an edgeRoundness within 0.01 of zero,
// where Remotion's bounding box overshoots the curves (COMPAT.md); for those
// only the structure is compared.
const TOLERANCE = 1e-12;
const PLACED_TOLERANCE = 1e-10;
const placed = (fn: string) => fn === "makePolygon" || fn === "makeStar";

type MakeCase = { fn: string; options: Record<string, unknown>; result: Outcome<unknown> };

// Options are stored with NaN, infinities and -0 as strings (see fixtures.ts).
const SENTINELS = new Set(["NaN", "Infinity", "-Infinity", "-0"]);
const decodeOptions = (options: Record<string, unknown>): Record<string, unknown> =>
	Object.fromEntries(
		Object.entries(options).map(([k, v]) => [
			k,
			typeof v === "string" && SENTINELS.has(v) ? Number(v) : v,
		]),
	);

const nearZeroRoundness = (c: MakeCase) =>
	(c.fn === "makePolygon" || c.fn === "makeStar") &&
	typeof c.options.edgeRoundness === "number" &&
	Math.abs(c.options.edgeRoundness) < 0.01;

describe("makeX() against the Remotion oracle", () => {
	it(`matches ${makeFixture.cases.length} generated shapes within ${TOLERANCE}`, () => {
		const tracker = new DeepTracker();
		const placedTracker = new DeepTracker();
		let skipped = 0;
		for (const c of makeFixture.cases as MakeCase[]) {
			const make = (shapes as unknown as Record<string, (o: unknown) => unknown>)[c.fn] as (
				o: unknown,
			) => unknown;
			const actual = outcomeOf(() => make(decodeOptions(c.options)));
			if (nearZeroRoundness(c)) {
				skipped++;
				const types = (o: Outcome<unknown>) =>
					(o.out as { instructions: { type: string }[] }).instructions.map((i) => i.type).join("");
				expect(types(actual)).toBe(types(c.result));
				continue;
			}
			(placed(c.fn) ? placedTracker : tracker).add(
				actual,
				c.result,
				() => `${c.fn}(${JSON.stringify(c.options)})`,
			);
		}
		expect(tracker.max, tracker.worst).toBeLessThanOrEqual(TOLERANCE);
		expect(placedTracker.max, placedTracker.worst).toBeLessThanOrEqual(PLACED_TOLERANCE);
		expect(skipped).toBeLessThan(80);
	});
});

const NUMBER = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g;

describe("shape components against the Remotion oracle", () => {
	type ComponentCase = {
		component: string;
		props: Record<string, unknown>;
		markup: Outcome<string>;
	};
	it("renders the same static markup (numbers within the tolerance)", () => {
		for (const c of componentsFixture.cases as ComponentCase[]) {
			const Component = (shapes as unknown as Record<string, (p: unknown) => React.ReactNode>)[
				c.component
			] as (p: unknown) => React.ReactNode;
			const markup = renderToStaticMarkup(<Component {...c.props} />);
			const expected = c.markup.out as string;
			expect(markup.replace(NUMBER, "#"), c.component).toBe(expected.replace(NUMBER, "#"));
			const a = markup.match(NUMBER) ?? [];
			const e = expected.match(NUMBER) ?? [];
			let max = 0;
			e.forEach((value, i) => {
				max = Math.max(max, errorOf(Number(a[i]), Number(value)));
			});
			const tolerance =
				c.component === "Polygon" || c.component === "Star" ? PLACED_TOLERANCE : TOLERANCE;
			expect(max, c.component).toBeLessThanOrEqual(tolerance);
		}
	});
});
