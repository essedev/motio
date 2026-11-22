import { describe, expect, it } from "vitest";
import { CLOCK_SHIM_SCRIPT, installClockShim, VIRTUAL_EPOCH_MS } from "./clock-shim.js";
import type { VirtualClock } from "./real-time.js";

/** A fresh window with the shim installed, isolated from the test environment's globals. */
function shimmedWindow(context?: Record<string, unknown>) {
	const iframe = document.createElement("iframe");
	document.body.appendChild(iframe);
	const win = iframe.contentWindow as Window & typeof globalThis & Record<string, unknown>;
	if (context) win.__motioContext = context;
	const untouched = {
		MessageChannel: win.MessageChannel,
		queueMicrotask: win.queueMicrotask,
		Promise: win.Promise,
		getRandomValues: win.crypto?.getRandomValues,
	};
	installClockShim(win);
	return {
		win,
		clock: win.__motioClock as VirtualClock & { setTime(ms: number): void },
		untouched,
	};
}

describe("clock shim", () => {
	it("works as a standalone script and starts at the documented epoch", () => {
		const iframe = document.createElement("iframe");
		document.body.appendChild(iframe);
		const win = iframe.contentWindow as Window & typeof globalThis & Record<string, unknown>;
		win.eval(CLOCK_SHIM_SCRIPT);
		const clock = win.__motioClock as VirtualClock;
		expect(win.Date.now()).toBe(VIRTUAL_EPOCH_MS);
		clock.setFrame(30, 30);
		expect(win.Date.now()).toBe(VIRTUAL_EPOCH_MS + 1000);
	});

	it("makes Date and performance.now follow the frame", () => {
		const { win, clock } = shimmedWindow();
		clock.setFrame(45, 30);
		expect(win.performance.now()).toBe(1500);
		expect(win.Date.now()).toBe(VIRTUAL_EPOCH_MS + 1500);
		expect(new win.Date().getTime()).toBe(VIRTUAL_EPOCH_MS + 1500);
		expect(new win.Date(0).getTime()).toBe(0);
		expect(new win.Date() instanceof win.Date).toBe(true);
		expect(typeof win.Date()).toBe("string");
		expect(win.Date.UTC(2020, 0, 1)).toBe(Date.UTC(2020, 0, 1));
	});

	it("reseeds Math.random per frame, independently of history", () => {
		const { win, clock } = shimmedWindow({ frameSeed: 7 });
		clock.setFrame(3, 30);
		const a = [win.Math.random(), win.Math.random()];
		clock.setFrame(10, 30);
		win.Math.random();
		clock.setFrame(3, 30);
		expect([win.Math.random(), win.Math.random()]).toEqual(a);
		const other = shimmedWindow({ frameSeed: 8 });
		other.clock.setFrame(3, 30);
		expect(other.win.Math.random()).not.toBe(a[0]);
	});

	it("runs timers due up to the frame time, in order, then one animation frame", () => {
		const { win, clock } = shimmedWindow();
		const log: string[] = [];
		win.setTimeout(() => log.push("t100"), 100);
		win.setTimeout(() => log.push("t0"), 0);
		const iv = win.setInterval(() => log.push("iv"), 40);
		win.requestAnimationFrame((t) => {
			log.push(`raf@${t}`);
			win.requestAnimationFrame(() => log.push("raf-next"));
		});
		const cancelled = win.setTimeout(() => log.push("never"), 10);
		win.clearTimeout(cancelled);
		clock.setTime(100);
		clock.runDue((fn) => fn());
		expect(log).toEqual(["t0", "iv", "iv", "t100", "raf@100"]);
		win.clearInterval(iv);
		log.length = 0;
		clock.setTime(200);
		clock.runDue((fn) => fn());
		expect(log).toEqual(["raf-next"]);
	});

	it("does not advance timers on its own", async () => {
		const { win } = shimmedWindow();
		let fired = false;
		win.setTimeout(() => {
			fired = true;
		}, 0);
		await new Promise((r) => setTimeout(r, 20));
		expect(fired).toBe(false);
	});

	it("reports runaway timers instead of hanging", () => {
		const { win, clock } = shimmedWindow();
		const again = () => win.setTimeout(again, 0);
		again();
		expect(() => clock.runDue((fn) => fn())).toThrow(/keeps rescheduling itself/);
	});

	it("leaves MessageChannel, queueMicrotask, Promise and crypto alone and keeps real timers", async () => {
		const { win, clock, untouched } = shimmedWindow();
		expect(win.MessageChannel).toBe(untouched.MessageChannel);
		expect(win.queueMicrotask).toBe(untouched.queueMicrotask);
		expect(win.Promise).toBe(untouched.Promise);
		expect(win.crypto?.getRandomValues).toBe(untouched.getRandomValues);
		const fired = await new Promise<boolean>((resolve) => {
			clock.real.setTimeout(() => resolve(true), 0);
		});
		expect(fired).toBe(true);
	});

	it("installs once", () => {
		const { win, clock } = shimmedWindow();
		installClockShim(win);
		expect(win.__motioClock).toBe(clock);
	});
});
