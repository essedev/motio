// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
	compositionFromHash,
	DEFAULT_PREFERENCES,
	hashForComposition,
	readPreferences,
	readSession,
	writePreferences,
	writeSession,
} from "./persist.js";

beforeEach(() => sessionStorage.clear());

describe("session persistence", () => {
	it("round-trips the frame, range and props of a composition", () => {
		const session = { frame: 12, range: { inFrame: 3, outFrame: 20 }, propsText: "{bad" };
		writeSession("Intro", session);
		expect(readSession("Intro")).toEqual(session);
		expect(readSession("Other")).toEqual({
			frame: 0,
			range: { inFrame: null, outFrame: null },
			propsText: null,
		});
	});

	it("ignores malformed stored values", () => {
		sessionStorage.setItem(
			"motio.preview.composition.X",
			JSON.stringify({ frame: -1, range: { inFrame: "a" }, propsText: 5 }),
		);
		expect(readSession("X")).toEqual({
			frame: 0,
			range: { inFrame: null, outFrame: null },
			propsText: null,
		});
		sessionStorage.setItem("motio.preview.composition.Y", "{not json");
		expect(readSession("Y").frame).toBe(0);
	});

	it("keeps only known preference values", () => {
		expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
		writePreferences({ zoom: 0.5, playbackRate: 2, loop: false });
		expect(readPreferences()).toEqual({ zoom: 0.5, playbackRate: 2, loop: false });
		sessionStorage.setItem(
			"motio.preview.preferences",
			JSON.stringify({ zoom: 3, playbackRate: 7, loop: "yes" }),
		);
		expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
	});
});

describe("hash selection", () => {
	it("encodes and decodes composition ids", () => {
		expect(hashForComposition("My-Comp")).toBe("#/My-Comp");
		expect(compositionFromHash("#/My-Comp")).toBe("My-Comp");
		expect(compositionFromHash(hashForComposition("片段-1"))).toBe("片段-1");
		expect(compositionFromHash("#Plain")).toBe("Plain");
		expect(compositionFromHash("")).toBeNull();
		expect(compositionFromHash("#/%E0%A4%A")).toBeNull();
	});
});
