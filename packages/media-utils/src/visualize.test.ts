import { describe, expect, it } from "vitest";
import { createSmoothSvgPath } from "./create-smooth-svg-path.js";
import { getWaveformPortion } from "./get-waveform-portion.js";
import type { MediaUtilsAudioData } from "./types.js";
import { visualizeAudio } from "./visualize-audio.js";
import { visualizeAudioWaveform } from "./visualize-audio-waveform.js";

let ids = 0;
function audio(channels: Float32Array[], sampleRate: number): MediaUtilsAudioData {
	return {
		channelWaveforms: channels,
		sampleRate,
		durationInSeconds: (channels[0]?.length ?? 0) / sampleRate,
		numberOfChannels: channels.length,
		resultId: `test-${ids++}`,
		isRemote: false,
	};
}

const ramp = (n: number, sign = 1) => Float32Array.from({ length: n }, (_, i) => (sign * i) / n);

describe("getWaveformPortion", () => {
	const data = audio([ramp(1000), ramp(1000, -1)], 100);

	it("averages absolute sample values per bar", () => {
		const bars = getWaveformPortion({
			audioData: data,
			startTimeInSeconds: 2,
			durationInSeconds: 1,
			numberOfSamples: 5,
			normalize: false,
		});
		expect(bars.map((b) => b.index)).toEqual([0, 1, 2, 3, 4]);
		// Bar 0 covers samples 200..219 of i / 1000.
		expect(bars[0]?.amplitude).toBeCloseTo(0.2095, 6);
		expect(bars[4]?.amplitude).toBeCloseTo(0.2895, 6);
	});

	it("normalizes by default and negates every other bar in minus-one-to-one", () => {
		const bars = getWaveformPortion({
			audioData: data,
			startTimeInSeconds: 2,
			durationInSeconds: 1,
			numberOfSamples: 5,
			channel: 1,
			outputRange: "minus-one-to-one",
		});
		expect(bars[4]?.amplitude).toBe(-1);
		expect(bars[3]?.amplitude).toBeGreaterThan(0);
		expect(bars[0]?.amplitude).toBeCloseTo(-0.2095 / 0.2895, 6);
	});

	it("treats samples outside the data as silence and shifts by dataOffsetInSeconds", () => {
		const tail = getWaveformPortion({
			audioData: data,
			startTimeInSeconds: 9.5,
			durationInSeconds: 1,
			numberOfSamples: 5,
			normalize: false,
		});
		expect(tail.slice(3).map((b) => b.amplitude)).toEqual([0, 0]);
		const shifted = getWaveformPortion({
			audioData: data,
			startTimeInSeconds: 3,
			durationInSeconds: 1,
			numberOfSamples: 5,
			normalize: false,
			dataOffsetInSeconds: 1,
		});
		expect(shifted[0]?.amplitude).toBeCloseTo(0.2095, 6);
	});

	it("returns no bars when a bar would hold no sample", () => {
		expect(
			getWaveformPortion({
				audioData: data,
				startTimeInSeconds: 1,
				durationInSeconds: 0.05,
				numberOfSamples: 6,
			}),
		).toEqual([]);
	});

	it("rejects channels outside the audio with a TypeError, as Remotion does", () => {
		const base = {
			audioData: data,
			startTimeInSeconds: 0,
			durationInSeconds: 1,
			numberOfSamples: 2,
		};
		expect(() => getWaveformPortion({ ...base, channel: -1 })).toThrow(
			new TypeError("channel is -1: use 0 or more."),
		);
		expect(() => getWaveformPortion({ ...base, channel: 2 })).toThrow(
			new TypeError("channel is 2, but the audio has 2 channels: use 0 to 1."),
		);
	});
});

describe("visualizeAudioWaveform", () => {
	const data = audio([ramp(1000)], 100);

	it("centres the window on frame / fps", () => {
		// 3 s +- 0.1 s: samples 290..309 in bars of 4.
		const values = visualizeAudioWaveform({
			audioData: data,
			frame: 30,
			fps: 10,
			numberOfSamples: 5,
			windowInSeconds: 0.2,
		});
		expect(values[0]).toBeCloseTo(-0.2915, 6);
		expect(values[1]).toBeCloseTo(0.2955, 6);
	});

	it("throws when the window holds fewer samples than requested", () => {
		expect(() =>
			visualizeAudioWaveform({
				audioData: data,
				frame: 30,
				fps: 10,
				numberOfSamples: 11,
				windowInSeconds: 0.1,
			}),
		).toThrow(
			"A window of 0.1 s holds fewer than 11 samples: increase windowInSeconds or decrease numberOfSamples.",
		);
	});
});

describe("visualizeAudio", () => {
	const sampleRate = 1024;
	const signal = (fn: (i: number) => number) =>
		audio([Float32Array.from({ length: sampleRate * 4 }, (_, i) => fn(i))], sampleRate);

	it("gives a flat spectrum for an impulse inside the window", () => {
		// The window is the 16 samples centred on sample 2048.
		for (const at of [2040, 2048, 2055]) {
			const values = visualizeAudio({
				audioData: signal((i) => (i === at ? 1 : 0)),
				frame: 2,
				fps: 1,
				numberOfSamples: 8,
				smoothing: false,
			});
			for (const v of values) expect(v).toBeCloseTo(0.125, 12);
		}
		const outside = visualizeAudio({
			audioData: signal((i) => (i === 2056 || i === 10 ? 1 : 0)),
			frame: 2,
			fps: 1,
			numberOfSamples: 8,
			smoothing: false,
		});
		expect(outside.every((v) => v === 0)).toBe(true);
	});

	it("smooths a DC signal across bands with three averaging passes", () => {
		const values = visualizeAudio({
			audioData: signal(() => 1),
			frame: 2,
			fps: 1,
			numberOfSamples: 8,
			smoothing: false,
		});
		expect(values[0]).toBe(2);
		expect(values[1]).toBeCloseTo(86 / 81, 14);
		expect(values[2]).toBeCloseTo(118 / 243, 14);
		expect(values[7]).toBe(0);
	});

	it("normalizes by the channel's peak, cached per resultId", () => {
		const quiet = signal((i) => (i === 2048 ? 0.5 : 0));
		const values = visualizeAudio({
			audioData: quiet,
			frame: 2,
			fps: 1,
			numberOfSamples: 4,
			smoothing: false,
		});
		expect(values[0]).toBeCloseTo((16383 / (0.5 * 32767)) * 0.25, 12);
		const louder = {
			...quiet,
			channelWaveforms: [
				Float32Array.from(quiet.channelWaveforms[0] as Float32Array, (v) => v / 2),
			],
		};
		const stale = visualizeAudio({
			audioData: louder,
			frame: 2,
			fps: 1,
			numberOfSamples: 4,
			smoothing: false,
		});
		expect(stale[0]).toBeCloseTo(values[0] / 2, 3);
	});

	it("averages the previous, current and next frame when smoothing", () => {
		const data = signal((i) => Math.sin(i / 3) * ((i % 97) / 97));
		const at = (frame: number) =>
			visualizeAudio({ audioData: data, frame, fps: 30, numberOfSamples: 16, smoothing: false });
		const smoothed = visualizeAudio({ audioData: data, frame: 40, fps: 30, numberOfSamples: 16 });
		const [a, b, c] = [at(39), at(40), at(41)];
		smoothed.forEach((v, i) => {
			expect(v).toBeCloseTo(((a[i] as number) + (b[i] as number) + (c[i] as number)) / 3, 14);
		});
	});

	it("rejects the numberOfSamples Remotion rejects", () => {
		const data = signal(() => 0.1);
		const call = (numberOfSamples: number) => () =>
			visualizeAudio({ audioData: data, frame: 1, fps: 1, numberOfSamples });
		expect(call(3)).toThrow(
			new TypeError("numberOfSamples is 3: use a power of two, such as 32, 64 or 128."),
		);
		expect(call(0)).toThrow("numberOfSamples is 0");
		expect(call(4096)).toThrow(/too few for numberOfSamples 4096 \(it needs 8192\)/);
		expect(call(1)()).toHaveLength(1);
	});
});

describe("createSmoothSvgPath", () => {
	it("reproduces the documented example", () => {
		expect(
			createSmoothSvgPath({
				points: [
					{ x: 0, y: 0 },
					{ x: 100, y: 100 },
					{ x: 200, y: 50 },
					{ x: 300, y: 150 },
				],
			}),
		).toBe(
			"M 0,0 C 20.000000000000004,20 60,90 100,100 C 140,110 160,40 200,50 C 240,60 280,130 300,150",
		);
	});

	it("handles no point and one point", () => {
		expect(createSmoothSvgPath({ points: [] })).toBe("");
		expect(createSmoothSvgPath({ points: [{ x: 1, y: 2 }] })).toBe("M 1,2");
	});
});
