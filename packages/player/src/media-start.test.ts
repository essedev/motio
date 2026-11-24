import { describe, expect, it } from "vitest";
import { MEDIA_START_TIMEOUT_MS, type MediaClock, MediaStartGate } from "./media-start.js";

function element(init: Partial<MediaClock> = {}): MediaClock {
	return { paused: false, ended: false, currentTime: 0, readyState: 4, playbackRate: 1, ...init };
}

describe("MediaStartGate", () => {
	it("runs at once when nothing plays", () => {
		const gate = new MediaStartGate();
		gate.open(0);
		expect(gate.poll(16, [element({ paused: true })])).toEqual({ hold: false, startedMsAgo: null });
		expect(gate.isOpen).toBe(false);
	});

	it("holds through the preroll and the output latency, then backdates to the start", () => {
		const gate = new MediaStartGate();
		const audio = element();
		gate.open(0);
		expect(gate.poll(16, [audio]).hold).toBe(true);
		// Preroll: a few tens of milliseconds, then currentTime stalls until the output starts.
		audio.currentTime = 0.03;
		expect(gate.poll(33, [audio]).hold).toBe(true);
		expect(gate.poll(250, [audio]).hold).toBe(true);
		audio.currentTime = 0.05;
		expect(gate.poll(266, [audio]).hold).toBe(true);
		audio.currentTime = 0.08;
		expect(gate.poll(300, [audio])).toEqual({ hold: false, startedMsAgo: 80 });
	});

	it("moves elements that started sooner back to the slowest one", () => {
		const gate = new MediaStartGate();
		const video = element();
		const audio = element();
		gate.open(0);
		gate.poll(16, [video, audio]);
		video.currentTime = 0.3;
		audio.currentTime = 0.03;
		expect(gate.poll(300, [video, audio]).hold).toBe(true);
		video.currentTime = 0.32;
		audio.currentTime = 0.08;
		const result = gate.poll(320, [video, audio]);
		expect(result).toEqual({ hold: false, startedMsAgo: 80 });
		expect(video.currentTime).toBeCloseTo(0.08, 6);
		expect(audio.currentTime).toBe(0.08);
	});

	it("measures real time, not media time, at a playback rate", () => {
		const gate = new MediaStartGate();
		const audio = element({ playbackRate: 2 });
		gate.open(0);
		gate.poll(16, [audio]);
		// 0.1 s of media at 2x is 50 ms of real time: below the threshold.
		audio.currentTime = 0.1;
		expect(gate.poll(100, [audio]).hold).toBe(true);
		audio.currentTime = 0.16;
		expect(gate.poll(130, [audio])).toEqual({ hold: false, startedMsAgo: 80 });
	});

	it("waits for an element without enough data", () => {
		const gate = new MediaStartGate();
		const audio = element({ readyState: 2 });
		gate.open(0);
		gate.poll(16, [audio]);
		audio.currentTime = 0.1;
		gate.poll(100, [audio]);
		audio.currentTime = 0.2;
		expect(gate.poll(200, [audio]).hold).toBe(true);
	});

	it("gives up after the timeout so a stalled element cannot hold the Player", () => {
		const gate = new MediaStartGate();
		const stuck = element();
		gate.open(0);
		expect(gate.poll(16, [stuck]).hold).toBe(true);
		expect(gate.poll(MEDIA_START_TIMEOUT_MS, [stuck])).toEqual({ hold: false, startedMsAgo: null });
		expect(stuck.currentTime).toBe(0);
	});

	it("measures again from a backward seek", () => {
		const gate = new MediaStartGate();
		const audio = element({ currentTime: 2 });
		gate.open(0);
		gate.poll(16, [audio]);
		audio.currentTime = 0;
		expect(gate.poll(33, [audio]).hold).toBe(true);
		audio.currentTime = 0.01;
		expect(gate.poll(50, [audio]).hold).toBe(true);
	});
});
