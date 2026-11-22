import { afterEach, describe, expect, it, vi } from "vitest";
import { audioBufferToDataUrl } from "./audio-buffer-to-data-url.js";
import { isRemoteAsset } from "./is-remote.js";
import { contiguousLoaded, windowRange, windowsAround } from "./use-windowed-audio-data.js";

describe("isRemoteAsset", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("treats only same-origin absolute URLs and data URLs as local", () => {
		vi.stubGlobal("location", { origin: "http://localhost:3000" });
		expect(isRemoteAsset("http://localhost:3000/a.wav")).toBe(false);
		expect(isRemoteAsset("data:audio/wav;base64,AAAA")).toBe(false);
		expect(isRemoteAsset("/a.wav")).toBe(true);
		expect(isRemoteAsset("blob:http://localhost:3000/123")).toBe(true);
		expect(isRemoteAsset("https://example.com/a.wav")).toBe(true);
	});
});

describe("audioBufferToDataUrl", () => {
	it("encodes a 32-bit float WAV with interleaved channels", () => {
		const channels = [Float32Array.of(0, 0.5, -0.5, 1)];
		const url = audioBufferToDataUrl({
			numberOfChannels: 1,
			length: 4,
			sampleRate: 8000,
			getChannelData: (c) => channels[c] as Float32Array,
		});
		expect(url.startsWith("data:audio/wav;base64,")).toBe(true);
		const bytes = Buffer.from(url.split(",")[1] as string, "base64");
		expect(bytes.toString("hex")).toBe(
			"524946463400000057415645666d74201000000003000100401f0000007d0000040020006461746110000000000000000000003f000000bf0000803f",
		);
	});
});

describe("windowed helpers", () => {
	it("loads the previous, current and next window inside the file", () => {
		expect(windowsAround(0, 30, 1, 4)).toEqual({ current: 0, needed: [0, 1] });
		expect(windowsAround(60, 30, 1, 4)).toEqual({ current: 2, needed: [1, 2, 3] });
		expect(windowsAround(119, 30, 0.7, 4)).toEqual({ current: 5, needed: [4, 5] });
		expect(windowsAround(59, 30, 0.3, 2)).toEqual({ current: 6, needed: [5, 6] });
	});

	it("tiles the file with windows that neither overlap nor leave gaps", () => {
		const frames = 192000;
		let end = 0;
		for (let w = 0; w < Math.ceil(4 / 0.7); w++) {
			const [from, to] = windowRange(w, 0.7, 48000, frames);
			expect(from).toBe(end);
			end = to;
		}
		expect(end).toBe(frames);
	});

	it("returns loaded windows only when they are contiguous", () => {
		const loaded = (set: number[]) => (w: number) => set.includes(w);
		expect(contiguousLoaded([1, 2, 3], loaded([1, 2]), 2)).toEqual([1, 2]);
		expect(contiguousLoaded([1, 2, 3], loaded([1, 3]), 2)).toEqual([]);
		expect(contiguousLoaded([1, 2, 3], loaded([1, 2, 3]), 2)).toEqual([1, 2, 3]);
	});
});
