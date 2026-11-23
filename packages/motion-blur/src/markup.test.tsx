// <CameraMotionBlur> and <Trail> render the same markup as the published @remotion/motion-blur
// around a probe printing useCurrentFrame() (tools/oracle/record-motion-blur.mjs), and reject
// the same invalid props with the same error class (the messages are Motio's own).
import { Sequence, useCurrentFrame } from "@motiojs/core";
import { CompositionFrame } from "@motiojs/core/internals";
import { compareFailure, failureOf } from "@motiojs/testing/oracle-errors";
import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import fixture from "./__oracle__/markup.json" with { type: "json" };
import { CameraMotionBlur, Trail } from "./index.js";

type Case = {
	component: "CameraMotionBlur" | "Trail";
	props: Record<string, unknown>;
	frame?: number;
	sequence?: Record<string, number>;
	markup?: string;
	error?: string | null;
	errorType?: string;
};

const COMPONENTS = { CameraMotionBlur, Trail } as const;

const config = {
	id: "test",
	width: 100,
	height: 100,
	fps: 30,
	durationInFrames: 30,
	defaultProps: {},
	props: {},
	defaultCodec: null,
	defaultOutName: null,
	defaultVideoImageFormat: null,
	defaultPixelFormat: null,
	defaultProResProfile: null,
	defaultSampleRate: null,
};

const Probe = () => h("i", null, String(useCurrentFrame()));

const untag = (props: Record<string, unknown>) =>
	Object.fromEntries(
		Object.entries(props).map(([k, v]) => {
			if (v !== null && typeof v === "object" && "$n" in v)
				return [k, Number((v as { $n: string }).$n)];
			if (v !== null && typeof v === "object" && "$u" in v) return [k, undefined];
			return [k, v];
		}),
	);

const element = (c: Case): ReactElement => {
	const blur = h(COMPONENTS[c.component] as never, untag(c.props) as never, h(Probe));
	return c.sequence ? h(Sequence, c.sequence, blur) : blur;
};

// `data-motio-from` is the attribute Motio's renderer reads on a Sequence wrapper;
// Remotion's markup has no such attribute.
const markupAt = (c: Case) =>
	renderToStaticMarkup(
		h(CompositionFrame, { component: () => element(c), config, frame: c.frame ?? 0 }),
	).replace(/ data-motio-from="[^"]*"/g, "");

const cases = fixture.cases as Case[];

/** Props that a failure message should name when the recorded one does. */
const PROPS = ["samples", "shutterAngle", "layers", "trailOpacity", "lagInFrames"];

describe("motion blur markup equals @remotion/motion-blur", () => {
	for (const component of ["CameraMotionBlur", "Trail"] as const) {
		const own = cases.filter((c) => c.component === component && c.markup !== undefined);
		it(`${component} over ${own.length} props, frames and sequences`, () => {
			for (const c of own) {
				const label = `${component} ${JSON.stringify(c.props)} ${JSON.stringify(c.sequence ?? {})} at ${c.frame}`;
				expect(markupAt(c), label).toContain(c.markup);
			}
		});
	}

	// Motio validates before any hook, so the error surfaces without a composition (whose error
	// boundary would swallow it in server rendering).
	it("rejects the same invalid props, in the same order, with the same error class", () => {
		for (const c of cases.filter((x) => x.error !== undefined)) {
			const label = `${c.component} ${JSON.stringify(c.props)}`;
			const { threw, error } = failureOf(() => renderToStaticMarkup(element(c)));
			if (c.error === null || c.error === undefined) {
				expect(threw, label).toBe(false);
				continue;
			}
			expect(threw, label).toBe(true);
			expect(
				compareFailure(error, { error: c.error, errorType: c.errorType }, PROPS),
				label,
			).toBeUndefined();
		}
	});
});
