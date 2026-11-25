import { describe, expect, it } from "vitest";
import {
	FRAME_GATE_SCRIPT,
	FRAME_LOOP_CALLS,
	type FrameGate,
	installFrameGate,
} from "./frame-gate.js";

/** A window whose animation frames run when the test says so. */
function fakeWindow() {
	let next = 1;
	let frames = new Map<number, FrameRequestCallback>();
	const timeouts: Array<() => void> = [];
	const win = {
		requestAnimationFrame: (cb: FrameRequestCallback) => {
			const id = next++;
			frames.set(id, cb);
			return id;
		},
		cancelAnimationFrame: (id: number) => {
			frames.delete(id);
		},
		setTimeout: (cb: () => void) => {
			timeouts.push(cb);
			return 0;
		},
	} as unknown as Window & typeof globalThis;
	installFrameGate(win);
	return {
		win,
		gate: (win as unknown as { __motioFrameGate: FrameGate }).__motioFrameGate,
		/** Runs one animation frame of the fake browser. */
		frame(time = 0) {
			const due = frames;
			frames = new Map();
			for (const cb of due.values()) cb(time);
		},
		requested: () => frames.size,
		timeouts,
	};
}

describe("frame gate", () => {
	it("runs callbacks while open, holds them while closed, and runs them when it opens", async () => {
		const page = fakeWindow();
		const calls: number[] = [];
		const loop = (t: number) => {
			calls.push(t);
			page.win.requestAnimationFrame(loop);
		};
		page.win.requestAnimationFrame(loop);
		page.frame(1);
		page.frame(2);
		expect(calls).toEqual([1, 2]);
		// Closing lets the callback already requested from the browser run, and holds the next.
		const closed = page.gate.close();
		page.frame(3);
		await closed;
		expect(calls).toEqual([1, 2, 3]);
		expect(page.requested()).toBe(0);
		page.frame(4);
		expect(calls).toEqual([1, 2, 3]);
		page.gate.open();
		page.frame(5);
		expect(calls).toEqual([1, 2, 3, 5]);
	});

	it("cancels a held callback", async () => {
		const page = fakeWindow();
		let ran = false;
		await page.gate.close();
		const id = page.win.requestAnimationFrame(() => {
			ran = true;
		});
		page.win.cancelAnimationFrame(id);
		page.gate.open();
		page.frame();
		expect(ran).toBe(false);
	});

	it("stops waiting for a frame the browser does not draw", async () => {
		const page = fakeWindow();
		page.win.requestAnimationFrame(() => undefined);
		const closed = page.gate.close();
		for (const timeout of page.timeouts) timeout();
		await closed;
		page.frame();
		expect(page.requested()).toBe(0);
	});

	it("reports a loop once a callback asked for the next frame enough times in a row", () => {
		const page = fakeWindow();
		const loop = () => page.win.requestAnimationFrame(loop);
		page.win.requestAnimationFrame(loop);
		for (let i = 1; i < FRAME_LOOP_CALLS; i++) page.frame();
		expect(page.gate.loop).toBe(false);
		page.frame();
		expect(page.gate.loop).toBe(true);
	});

	it("does not call one-off callbacks a loop", () => {
		const page = fakeWindow();
		for (let i = 0; i < FRAME_LOOP_CALLS * 2; i++) {
			page.win.requestAnimationFrame(() => undefined);
			page.frame();
		}
		expect(page.gate.loop).toBe(false);
	});

	it("serialises into a self-contained script", () => {
		const win = fakeWindow().win;
		const fresh = { ...win } as unknown as Record<string, unknown>;
		delete fresh.__motioFrameGate;
		new Function("window", FRAME_GATE_SCRIPT)(fresh);
		expect(typeof (fresh.__motioFrameGate as FrameGate).open).toBe("function");
	});
});
