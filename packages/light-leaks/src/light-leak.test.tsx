// <LightLeak> renders the markup of the published @remotion/light-leaks around its canvas, rejects
// the same invalid props with the same error class (the messages are Motio's own), and exports
// the same schema (tools/oracle-render/record-light-leaks-starburst.ts). Server rendering runs no
// layout effect, so nothing is drawn here: golden.integration.test.ts renders the fixture.
import {
	CompositionFrame,
	RemotionEnvironmentContext,
	rootTimelineState,
	TimelineContext,
	VideoConfigContext,
} from "@motiojs/core/internals";
import { compareFailure, failureOf } from "@motiojs/testing/oracle-errors";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import oracle from "./__oracle__/light-leaks.json" with { type: "json" };
import { LightLeak, type LightLeakProps, lightLeak, lightLeakEffectSchema } from "./index.js";
import { lightLeakProgress, resolveLightLeak } from "./validate.js";

// The Thumbnail the oracle rendered in: 320x180, 60 frames, a Player.
const CONFIG = {
	id: "test",
	width: 320,
	height: 180,
	fps: 30,
	durationInFrames: 60,
	defaultProps: {},
	props: {},
	defaultCodec: null,
	defaultOutName: null,
	defaultVideoImageFormat: null,
	defaultPixelFormat: null,
	defaultProResProfile: null,
	defaultSampleRate: null,
};
const PLAYER = {
	isStudio: false,
	isRendering: false,
	isPlayer: true,
	isReadOnlyStudio: false,
	isClientSideRendering: false,
};

/** Restores the numbers and `undefined` the recorder tagged. */
const untag = (props: Record<string, unknown>) =>
	Object.fromEntries(
		Object.entries(props).map(([k, v]) => {
			if (v !== null && typeof v === "object" && "$n" in v) {
				return [k, Number((v as { $n: string }).$n)];
			}
			if (v !== null && typeof v === "object" && "$u" in v) return [k, undefined];
			return [k, v];
		}),
	);

// `data-motio-from` is the attribute Motio's renderer reads on a Sequence container; Remotion's
// markup has no such attribute.
const markupAt = (props: Record<string, unknown>, frame: number) =>
	renderToStaticMarkup(
		h(
			RemotionEnvironmentContext.Provider,
			{ value: PLAYER },
			h(CompositionFrame, {
				component: () => h(LightLeak, props as unknown as LightLeakProps),
				config: CONFIG,
				frame,
			}),
		),
	)
		.replace(/ data-motio-(from|rate)="[^"]*"/g, "")
		// React writes Motio's container class before its style, Remotion's after: same element.
		.replace(/ (class="[^"]*") (style="[^"]*")/g, " $2 $1");

// CompositionFrame suspends on errors in server rendering; the bare contexts let them throw.
const renderBare = (props: Record<string, unknown>) =>
	renderToStaticMarkup(
		h(
			VideoConfigContext.Provider,
			{ value: CONFIG },
			h(
				TimelineContext.Provider,
				{ value: rootTimelineState(0, CONFIG.durationInFrames) },
				h(LightLeak, props as unknown as LightLeakProps),
			),
		),
	);

/** Options a failure message should name when the recorded one does. */
const NAMES = ["seed", "hueShift", "durationInFrames", "from"];

describe("LightLeak equals @remotion/light-leaks except in its pixels", () => {
	it(`renders the recorded markup for ${oracle.markup.length} props and frames`, () => {
		for (const c of oracle.markup) {
			expect(markupAt(untag(c.props), c.frame), JSON.stringify(c)).toBe(c.markup);
		}
	});

	it(`fails like the published component for ${oracle.invalid.length} props`, () => {
		for (const c of oracle.invalid) {
			const label = JSON.stringify(c.props);
			const { threw, error } = failureOf(() => renderBare(untag(c.props)));
			if (c.error === null) {
				expect(threw, label).toBe(false);
				continue;
			}
			expect(threw, label).toBe(true);
			// An invalid "from" fails in Motio's <Sequence>, whose error classes core's tests cover.
			if ("from" in c.props) continue;
			expect(compareFailure(error, c as { error: string; errorType: string }, NAMES), label).toBe(
				undefined,
			);
		}
	});

	it("exports the published effect schema", () => {
		expect(lightLeakEffectSchema).toEqual(oracle.schema);
	});
});

describe("lightLeak()", () => {
	it("throws, pointing to <LightLeak>, since Motio has no effect pipeline", () => {
		expect(() => lightLeak({ seed: 3 })).toThrow(/<LightLeak>/);
	});
});

describe("resolveLightLeak and lightLeakProgress", () => {
	it("defaults the seed and hue shift to 0", () => {
		expect(resolveLightLeak({})).toEqual({ seed: 0, hueShift: 0 });
		expect(resolveLightLeak({ seed: -3.5, hueShift: 360 })).toEqual({ seed: -3.5, hueShift: 360 });
	});

	it("goes from 0 on the first frame to 1 on the last, peaking halfway", () => {
		expect(lightLeakProgress(0, 61)).toBe(0);
		expect(lightLeakProgress(30, 61)).toBe(0.5);
		expect(lightLeakProgress(60, 61)).toBe(1);
		expect(lightLeakProgress(90, 61)).toBe(1);
		expect(lightLeakProgress(0, 1)).toBe(0.5);
		expect(lightLeakProgress(3, Number.POSITIVE_INFINITY)).toBe(0.5);
	});
});
