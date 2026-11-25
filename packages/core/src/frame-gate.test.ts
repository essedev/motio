import { describe, expect, it } from "vitest";
import {
	FRAME_GATE_SCRIPT,
	FRAME_LOOP_CALLS,
	type FrameGate,
	installFrameGate,
} from "./frame-gate.js";

/** A window whose animation frames and timers run when the test says so. */
function fakeWindow() {
	let next = 1;
	let frames = new Map<number, FrameRequestCallback>();
	const timers = new Map<number, { cb: () => void; interval: boolean }>();
	const add = (cb: () => void, interval: boolean) => {
		const id = next++;
		timers.set(id, { cb, interval });
		return id;
	};
	const win = {
		requestAnimationFrame: (cb: FrameRequestCallback) => {
			const id = next++;
			frames.set(id, cb);
			return id;
		},
		cancelAnimationFrame: (id: number) => {
			frames.delete(id);
		},
		setTimeout: (cb: () => void) => add(cb, false),
		clearTimeout: (id: number) => timers.delete(id),
		setInterval: (cb: () => void) => add(cb, true),
		clearInterval: (id: number) => timers.delete(id),
		performance: { now: () => 0 },
		Date,
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
		/** Fires every pending browser timer once (intervals stay scheduled). */
		tick() {
			for (const [id, timer] of [...timers]) {
				if (!timers.has(id)) continue; // Cleared by a timer that ran before it.
				if (!timer.interval) timers.delete(id);
				timer.cb();
			}
		},
		requested: () => frames.size,
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
		page.tick();
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

	it("holds timers that come due while closed and runs them, an interval once, when it opens", async () => {
		const page = fakeWindow();
		const calls: string[] = [];
		page.win.setTimeout(() => calls.push("timeout"), 10);
		page.win.setInterval(() => calls.push("interval"), 10);
		await page.gate.close();
		page.tick();
		page.tick();
		expect(calls).toEqual([]);
		page.gate.open();
		page.tick();
		expect(calls.sort()).toEqual(["interval", "timeout"]);
		page.tick();
		expect(calls.filter((c) => c === "interval")).toHaveLength(2);
	});

	it("clears a held timer with either clear function", async () => {
		const page = fakeWindow();
		let ran = 0;
		const timeout = page.win.setTimeout(() => ran++, 0);
		const interval = page.win.setInterval(() => ran++, 5);
		await page.gate.close();
		page.tick();
		page.win.clearInterval(timeout);
		page.win.clearTimeout(interval);
		page.gate.open();
		page.tick();
		expect(ran).toBe(0);
	});

	it("passes arguments and evaluates string handlers globally", () => {
		const page = fakeWindow();
		const seen: unknown[] = [];
		page.win.setTimeout((a: unknown, b: unknown) => seen.push(a, b), 0, 1, "two");
		page.tick();
		expect(seen).toEqual([1, "two"]);
	});

	it("reports a timer loop and tells the observer which callbacks are its iterations", () => {
		const page = fakeWindow();
		const seen: boolean[] = [];
		page.gate.observe({ before: () => undefined, after: (loop) => seen.push(loop) });
		const chain = () => page.win.setTimeout(chain, 0);
		page.win.setTimeout(chain, 0);
		for (let i = 1; i < FRAME_LOOP_CALLS; i++) page.tick();
		expect(page.gate.timerLoop).toBe(false);
		page.tick();
		expect(page.gate.timerLoop).toBe(true);
		expect(page.gate.loop).toBe(false);
		expect(seen.slice(-2)).toEqual([false, true]);
		// A one-off timer is not an iteration, even once a loop was seen.
		page.win.setTimeout(() => undefined, 0);
		page.gate.observe(null);
		page.tick();
		expect(page.gate.timerLoop).toBe(true);
	});

	it("counts the calls of an interval as a loop", () => {
		const page = fakeWindow();
		page.win.setInterval(() => undefined, 1);
		for (let i = 0; i < FRAME_LOOP_CALLS; i++) page.tick();
		expect(page.gate.timerLoop).toBe(true);
	});

	it("keeps the browser's own timers aside", () => {
		const page = fakeWindow();
		let ran = false;
		page.gate.real.setTimeout(() => {
			ran = true;
		}, 0);
		return page.gate.close().then(() => {
			page.tick();
			expect(ran).toBe(true);
		});
	});

	it("serialises into a self-contained script", () => {
		const win = fakeWindow().win;
		const fresh = { ...win } as unknown as Record<string, unknown>;
		delete fresh.__motioFrameGate;
		new Function("window", FRAME_GATE_SCRIPT)(fresh);
		expect(typeof (fresh.__motioFrameGate as FrameGate).open).toBe("function");
	});
});
