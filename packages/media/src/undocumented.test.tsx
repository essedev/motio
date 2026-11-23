import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import recorded from "./__oracle__/exports.json" with { type: "json" };
import * as media from "./index.js";

describe("undocumented @remotion/media exports", () => {
	it("exports every name of the published package", () => {
		for (const name of recorded.exports) expect(media, name).toHaveProperty(name);
	});

	it("getTargetSampleRate() returns the recorded value", () => {
		expect(media.getTargetSampleRate.length).toBe(recorded.getTargetSampleRate.node.length);
		expect(media.getTargetSampleRate()).toBe(recorded.getTargetSampleRate.node.value);
		expect(media.getTargetSampleRate()).toBe(recorded.getTargetSampleRate.browser.value);
	});

	it("AudioForPreview fails with a message pointing to <Audio>", () => {
		expect(typeof media.AudioForPreview).toBe(recorded.AudioForPreview.typeof);
		expect(() => renderToStaticMarkup(h(media.AudioForPreview, {}))).toThrow(/Use <Audio>/);
	});
});
