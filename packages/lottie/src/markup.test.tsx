// <Lottie> renders the same container markup as the published @remotion/lottie, rejects invalid
// props with the same messages, and getLottieMetadata() returns the same values
// (tools/oracle/record-lottie.mjs).
import { CompositionFrame } from "@motiojs/core/internals";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import oracle from "./__oracle__/lottie.json" with { type: "json" };
import { getLottieMetadata, Lottie, type LottieAnimationData, type LottieProps } from "./index.js";

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

const untag = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(untag);
	if (value !== null && typeof value === "object") {
		if ("$u" in value) return undefined;
		if ("$n" in value) return Number((value as { $n: string }).$n);
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, untag(v)]));
	}
	return value;
};
const tag = (value: unknown): unknown => {
	if (value === undefined) return { $u: true };
	if (typeof value === "number" && !Number.isFinite(value)) return { $n: String(value) };
	if (Array.isArray(value)) return value.map(tag);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, tag(v)]));
	}
	return value;
};

const props = (extra: unknown) =>
	({ animationData: oracle.data, ...(untag(extra) as object) }) as unknown as LottieProps;

const markupAt = (extra: unknown, frame: number) =>
	renderToStaticMarkup(
		h(CompositionFrame, { component: () => h(Lottie, props(extra)), config, frame }),
	);

describe("Lottie markup equals @remotion/lottie", () => {
	it(`over ${oracle.markup.length} props and frames`, () => {
		for (const c of oracle.markup) {
			expect(markupAt(c.props, c.frame), `${JSON.stringify(c.props)} at ${c.frame}`).toBe(c.markup);
		}
	});

	it("rejects invalid props with Remotion's messages", () => {
		for (const c of oracle.errors) {
			// lottie-web itself rejects an array as animation data, while loading.
			if (c.error?.includes("reading 'length'")) continue;
			let message: string | null = null;
			try {
				renderToStaticMarkup(h(Lottie, props(c.props)));
			} catch (error) {
				message = `${(error as Error).name}: ${(error as Error).message}`;
			}
			if (c.error === null) {
				// Valid props: the component goes on to read the timeline, absent here.
				expect(message, JSON.stringify(c.props)).toMatch(/outside|composition/i);
				expect(markupAt(c.props, 3)).toBe("<div></div>");
			} else {
				expect(message, JSON.stringify(c.props)).toBe(c.error);
			}
		}
	});
});

describe("getLottieMetadata equals @remotion/lottie", () => {
	it(`over ${oracle.metadata.length} inputs`, () => {
		for (const c of oracle.metadata) {
			const input = untag(c.input) as LottieAnimationData;
			let got: unknown;
			try {
				got = { out: tag(getLottieMetadata(input)) };
			} catch (error) {
				got = { error: `${(error as Error).name}: ${(error as Error).message}` };
			}
			expect(got, JSON.stringify(c.input)).toEqual(
				"error" in c ? { error: c.error } : { out: c.out },
			);
		}
	});
});
