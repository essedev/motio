// <Lottie> renders the same container markup as the published @remotion/lottie, rejects the same
// invalid props with the same error class (the messages are Motio's own), and getLottieMetadata()
// returns the same values (tools/oracle/record-lottie.mjs).
import { CompositionFrame } from "@motiojs/core/internals";
import { compareFailure, failureOf, type RecordedFailure } from "@motiojs/testing/oracle-errors";
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

/** Props that a failure message should name when the recorded one does. */
const PROPS = ["animationData", "playbackRate", "loop"];

/** The recorder writes failures as "Name: message". */
const recordedFailure = (recorded: string): RecordedFailure => {
	const [, errorType, error = recorded] = /^(\w+): ([\s\S]*)$/.exec(recorded) ?? [];
	return { error, errorType };
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

	it("rejects the same invalid props, in the same order, with the same error class", () => {
		for (const c of oracle.errors) {
			// lottie-web itself rejects an array as animation data, while loading.
			if (c.error?.includes("reading 'length'")) continue;
			const label = JSON.stringify(c.props);
			const { threw, error } = failureOf(() => renderToStaticMarkup(h(Lottie, props(c.props))));
			expect(threw, label).toBe(true);
			if (c.error === null) {
				// Valid props: the component goes on to read the timeline, absent here.
				expect((error as Error).message, label).toMatch(/outside|composition/i);
				expect(markupAt(c.props, 3)).toBe("<div></div>");
			} else {
				expect(compareFailure(error, recordedFailure(c.error), PROPS), label).toBeUndefined();
			}
		}
	});
});

describe("getLottieMetadata equals @remotion/lottie", () => {
	it(`over ${oracle.metadata.length} inputs`, () => {
		for (const c of oracle.metadata) {
			const input = untag(c.input) as LottieAnimationData;
			const label = JSON.stringify(c.input);
			if ("error" in c && typeof c.error === "string") {
				const { threw, error } = failureOf(() => getLottieMetadata(input));
				expect(threw, label).toBe(true);
				expect(compareFailure(error, recordedFailure(c.error)), label).toBeUndefined();
			} else {
				expect({ out: tag(getLottieMetadata(input)) }, label).toEqual({ out: c.out });
			}
		}
	});
});
