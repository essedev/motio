/**
 * The real clock and timers. In the virtual time model the clock shim replaces the globals and
 * keeps the originals on `window.__motioClock.real`; readiness timeouts and the settle loop must
 * always run on real time, so they go through this module.
 */

import { getFrameGate } from "./frame-gate.js";

/** Global installed by the clock shim (see `clock-shim.ts`). */
export const CLOCK_GLOBAL = "__motioClock";

/** The real timers the shim keeps aside. */
export interface RealTimers {
	setTimeout: (cb: () => void, ms: number) => number;
	clearTimeout: (id: number) => void;
	requestAnimationFrame: (cb: (t: number) => void) => number;
	/** Real monotonic milliseconds (`performance.now` before patching). */
	now: () => number;
	/** Real wall-clock milliseconds (`Date.now` before patching). */
	dateNow: () => number;
}

/** The controller the shim installs as `window.__motioClock`. */
export interface VirtualClock {
	real: RealTimers;
	/** Current virtual time in milliseconds since the composition start. */
	readonly now: number;
	/** Moves the virtual clock to `frame` and reseeds `Math.random`. */
	setFrame(frame: number, fps: number): void;
	/** Runs timers due up to the current virtual time, then one animation frame. */
	runDue(wrap: (fn: () => void) => void): void;
}

/** The installed virtual clock, or null in the frame time model. */
export function getVirtualClock(): VirtualClock | null {
	const value = (globalThis as Record<string, unknown>)[CLOCK_GLOBAL];
	return value && typeof value === "object" ? (value as VirtualClock) : null;
}

function captureReal(): RealTimers {
	const shim = getVirtualClock();
	if (shim) return shim.real;
	// The frame gate holds page timers between seeks; the runtime's own must never wait.
	const gate = getFrameGate();
	if (gate) return gate.real;
	const g = globalThis;
	const perf = typeof performance !== "undefined" ? performance : null;
	return {
		setTimeout: (cb, ms) => g.setTimeout(cb, ms) as unknown as number,
		clearTimeout: (id) => g.clearTimeout(id),
		requestAnimationFrame: (cb) =>
			typeof g.requestAnimationFrame === "function"
				? g.requestAnimationFrame(cb)
				: (g.setTimeout(() => cb(perf ? perf.now() : Date.now()), 16) as unknown as number),
		now: perf ? () => perf.now() : () => Date.now(),
		dateNow: () => Date.now(),
	};
}

let cached: RealTimers | null = null;

/** The real timers, captured on first use (after the shim, if any, was installed). */
export function realTimers(): RealTimers {
	if (!cached) cached = captureReal();
	return cached;
}

/** Resolves after one real macrotask. */
export function realMacrotask(): Promise<void> {
	return new Promise((resolve) => {
		realTimers().setTimeout(resolve, 0);
	});
}
