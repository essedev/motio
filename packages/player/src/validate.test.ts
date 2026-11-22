import { describe, expect, it } from "vitest";
import {
	assertUnchanged,
	validateCanvasProps,
	validateInOutFrames,
	validatePlaybackRate,
	validatePlayerProps,
	validateVolume,
} from "./validate.js";

const Comp = () => null;
const base = {
	component: Comp,
	durationInFrames: 90,
	fps: 30,
	compositionWidth: 1920,
	compositionHeight: 1080,
};

describe("validateCanvasProps", () => {
	it("accepts valid props", () => {
		expect(() => validateCanvasProps("Player", base)).not.toThrow();
		expect(() =>
			validateCanvasProps("Player", { ...base, component: undefined, lazyComponent: () => null }),
		).not.toThrow();
	});
	it("requires exactly one of component and lazyComponent", () => {
		expect(() => validateCanvasProps("Player", { ...base, component: undefined })).toThrow(
			/"component" or a "lazyComponent"/,
		);
		expect(() => validateCanvasProps("Player", { ...base, lazyComponent: () => null })).toThrow(
			/not both/,
		);
	});
	it("checks durationInFrames, fps and the composition size", () => {
		for (const durationInFrames of [0, -1, 1.5, Number.NaN, "90"]) {
			expect(() => validateCanvasProps("Player", { ...base, durationInFrames })).toThrow(
				/durationInFrames/,
			);
		}
		for (const fps of [0, -30, Number.POSITIVE_INFINITY, "30"]) {
			expect(() => validateCanvasProps("Player", { ...base, fps })).toThrow(/"fps"/);
		}
		expect(() => validateCanvasProps("Player", { ...base, compositionWidth: 0 })).toThrow(
			/compositionWidth/,
		);
		expect(() =>
			validateCanvasProps("Thumbnail", { ...base, compositionHeight: undefined }),
		).toThrow(/<Thumbnail>: "compositionHeight"/);
	});
	it("requires inputProps to be an object", () => {
		expect(() => validateCanvasProps("Player", { ...base, inputProps: [] })).toThrow(/inputProps/);
		expect(() => validateCanvasProps("Player", { ...base, inputProps: null })).toThrow(
			/inputProps/,
		);
	});
});

describe("Player-only props", () => {
	it("bounds the playback rate to [-10, 10] without 0", () => {
		for (const ok of [1, -1, 0.25, 10, -10]) expect(() => validatePlaybackRate(ok)).not.toThrow();
		for (const bad of [0, 10.5, -11, Number.NaN, "1"]) {
			expect(() => validatePlaybackRate(bad)).toThrow(/playbackRate/);
		}
	});
	it("checks inFrame and outFrame", () => {
		expect(() => validateInOutFrames(10, 20, 90)).not.toThrow();
		expect(() => validateInOutFrames(null, null, 90)).not.toThrow();
		expect(() => validateInOutFrames(20, 10, 90)).toThrow(/greater than "inFrame"/);
		expect(() => validateInOutFrames(10, 10, 90)).toThrow(/greater than "inFrame"/);
		expect(() => validateInOutFrames(-1, null, 90)).toThrow(/inFrame/);
		expect(() => validateInOutFrames(1.5, null, 90)).toThrow(/inFrame/);
		expect(() => validateInOutFrames(null, 0, 90)).toThrow(/at least 1/);
		expect(() => validateInOutFrames(null, 90, 90)).toThrow(/at most durationInFrames - 1/);
		expect(() => validateInOutFrames(90, null, 90)).toThrow(/at most/);
	});
	it("checks initialFrame and the numeric options", () => {
		const v = (p: Record<string, unknown>) => () =>
			validatePlayerProps({ durationInFrames: 90, ...p });
		expect(v({ initialFrame: 89 })).not.toThrow();
		expect(v({ initialFrame: 90 })).toThrow(/initialFrame/);
		expect(v({ numberOfSharedAudioTags: -1 })).toThrow(/numberOfSharedAudioTags/);
		expect(v({ numberOfSharedAudioTags: 0 })).not.toThrow();
		expect(v({ sampleRate: 0 })).toThrow(/sampleRate/);
		expect(v({ defaultPremountInSeconds: -1 })).toThrow(/defaultPremountInSeconds/);
		expect(v({ bufferStateDelayInMilliseconds: -5 })).toThrow(/bufferStateDelayInMilliseconds/);
		expect(v({ bufferStateDelayInMilliseconds: 0 })).not.toThrow();
		expect(v({ initialVolume: 1.2 })).toThrow(/initialVolume/);
		expect(v({ initiallyShowControls: 500 })).not.toThrow();
		expect(v({ initiallyShowControls: -1 })).toThrow(/initiallyShowControls/);
		expect(v({ hideControlsWhenPointerDoesntMove: "x" })).toThrow(/hideControls/);
		expect(v({ showPlaybackRateControl: [1, 2] })).not.toThrow();
		expect(v({ showPlaybackRateControl: [1, 0] })).toThrow(/playbackRate/);
		expect(v({ showPlaybackRateControl: [] })).toThrow(/showPlaybackRateControl/);
		expect(v({ posterFillMode: "cover" })).toThrow(/posterFillMode/);
		expect(v({ browserMediaControlsBehavior: { mode: "register-media-session" } })).not.toThrow();
		expect(v({ browserMediaControlsBehavior: { mode: "x" } })).toThrow(/mode/);
		expect(v({ browserMediaControlsBehavior: {} })).toThrow(/mode/);
		expect(v({ logLevel: "debug" })).toThrow(/logLevel/);
		expect(v({ audioLatencyHint: "fast" })).toThrow(/audioLatencyHint/);
		expect(v({ preferredEffectBackend: "metal" })).toThrow(/preferredEffectBackend/);
		expect(v({ volumePersistenceKey: "" })).toThrow(/volumePersistenceKey/);
	});
	it("checks volumes", () => {
		expect(() => validateVolume("setVolume()", 0)).not.toThrow();
		expect(() => validateVolume("setVolume()", 1)).not.toThrow();
		expect(() => validateVolume("setVolume()", -0.1)).toThrow(/between 0 and 1/);
		expect(() => validateVolume("setVolume()", "1")).toThrow(/between 0 and 1/);
	});
	it("rejects changes of props fixed at mount", () => {
		expect(() => assertUnchanged("initialFrame", 0, 0)).not.toThrow();
		expect(() => assertUnchanged("initialFrame", 0, 5)).toThrow(/cannot change after/);
	});
});
