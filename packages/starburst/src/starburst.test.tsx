// <Starburst> renders the markup of the published @remotion/starburst around its canvas, rejects
// the same invalid props with the same error class (the messages are Motio's own), and exports
// the same schema (tools/oracle-render/record-light-leaks-starburst.ts). Server rendering runs no
// layout effect, so nothing is drawn here: the pixels are covered by golden.integration.test.ts.
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
import oracle from "./__oracle__/starburst.json" with { type: "json" };
import { Starburst, type StarburstProps, starburst, starburstEffectSchema } from "./index.js";
import { resolveStarburst } from "./validate.js";

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
				component: () => h(Starburst, props as unknown as StarburstProps),
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
				h(Starburst, props as unknown as StarburstProps),
			),
		),
	);

/** Options a failure message should name when the recorded one does. */
const NAMES = ["rays", "colors", "rotation", "smoothness", "vignette", "from", "durationInFrames"];

describe("Starburst equals @remotion/starburst", () => {
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
			// Invalid timing props fail in Motio's <Sequence>, whose error classes core's tests cover.
			if ("from" in c.props || "durationInFrames" in c.props) continue;
			expect(compareFailure(error, c as { error: string; errorType: string }, NAMES), label).toBe(
				undefined,
			);
		}
	});

	it("exports the published effect schema", () => {
		expect(starburstEffectSchema).toEqual(oracle.schema);
	});
});

describe("starburst()", () => {
	it("throws, pointing to <Starburst>, since Motio has no effect pipeline", () => {
		expect(() => starburst({ rays: 4, colors: ["red", "blue"] })).toThrow(/<Starburst>/);
	});
});

describe("resolveStarburst", () => {
	it("resolves the defaults and the measured origin and vignette rules", () => {
		const params = resolveStarburst({ rays: 6, colors: ["red", "#00f"] });
		expect(params).toEqual({
			rays: 6,
			colors: [
				[255, 0, 0],
				[0, 0, 255],
			],
			rotation: 0,
			smoothness: 0,
			origin: [0.5, 0.5],
			vignette: 1,
		});
		const moved = resolveStarburst({
			rays: 6,
			colors: ["red", "blue"],
			originOffsetX: 0.5,
			originOffsetY: -0.25,
			vignette: 0,
		});
		expect(moved.origin).toEqual([1, 0.75]);
		expect(moved.vignette).toBeNull();
	});

	it("drops the alpha of the colors", () => {
		expect(
			resolveStarburst({ rays: 2, colors: ["transparent", "rgba(0, 0, 255, 0.5)"] }).colors,
		).toEqual([
			[0, 0, 0],
			[0, 0, 255],
		]);
	});
});
