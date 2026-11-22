/**
 * The virtual-clock shim for the virtual time model (ARCHITECTURE, "Time"). The renderer injects
 * `CLOCK_SHIM_SCRIPT` with `Page.addScriptToEvaluateOnNewDocument` before any page script, only
 * when `timeModel` is `"virtual"`.
 *
 * It makes `Date`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame` and
 * `Math.random` follow the frame time. It never patches `MessageChannel`, `queueMicrotask`,
 * `Promise`, `setImmediate` or `crypto.getRandomValues`: React's scheduler and id generators
 * depend on them. The real timers stay available on `window.__motioClock.real`.
 */

/** Wall-clock time of virtual time 0: 2026-01-01T00:00:00Z. */
export const VIRTUAL_EPOCH_MS = Date.UTC(2026, 0, 1);

/** Most timer callbacks one `runDue()` may run before it reports a runaway loop. */
export const MAX_TIMERS_PER_FRAME = 100_000;

/**
 * Installs the shim on `win`. Self-contained on purpose: it is serialised with
 * `Function.prototype.toString` into `CLOCK_SHIM_SCRIPT`, so it may not reference anything outside
 * its own body.
 */
export function installClockShim(win: Window & typeof globalThis): void {
	const w = win as unknown as Record<string, unknown> & Window & typeof globalThis;
	if (w.__motioClock) return;
	const EPOCH = 1767225600000; // VIRTUAL_EPOCH_MS, inlined: the function must be self-contained.
	const MAX_RUNS = 100000;
	const NativeDate = w.Date;
	const perf = w.performance;
	const real = {
		setTimeout: w.setTimeout.bind(w),
		clearTimeout: w.clearTimeout.bind(w),
		setInterval: w.setInterval.bind(w),
		clearInterval: w.clearInterval.bind(w),
		requestAnimationFrame: w.requestAnimationFrame.bind(w),
		cancelAnimationFrame: w.cancelAnimationFrame.bind(w),
		now: perf.now.bind(perf),
		dateNow: NativeDate.now.bind(NativeDate),
		Date: NativeDate,
		random: w.Math.random,
	};

	let now = 0;
	let nextId = 1;
	let seq = 0;
	type Timer = {
		due: number;
		seq: number;
		cb: (...args: unknown[]) => void;
		args: unknown[];
		interval: number | null;
	};
	const timers = new Map<number, Timer>();
	let rafQueue = new Map<number, (t: number) => void>();

	let rng = 1;
	const reseed = (frame: number) => {
		const ctx = w.__motioContext as { frameSeed?: unknown } | undefined;
		const seed = typeof ctx?.frameSeed === "number" ? ctx.frameSeed : 0;
		let h = Math.imul((frame | 0) ^ 0x9e3779b9, 0x85ebca6b);
		h ^= Math.imul(seed | 0, 0xc2b2ae35);
		h ^= h >>> 16;
		rng = h | 0;
	};
	reseed(0);
	// mulberry32
	w.Math.random = () => {
		rng = (rng + 0x6d2b79f5) | 0;
		let t = rng;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};

	Object.defineProperty(perf, "now", {
		value: () => now,
		configurable: true,
		writable: true,
	});

	function VirtualDate(this: unknown, ...args: unknown[]): unknown {
		if (!new.target) return new NativeDate(EPOCH + now).toString();
		const ctorArgs = args.length === 0 ? [EPOCH + now] : args;
		return Reflect.construct(NativeDate, ctorArgs, new.target);
	}
	Object.defineProperty(VirtualDate, "name", { value: "Date" });
	Object.defineProperty(VirtualDate, "length", { value: 7 });
	VirtualDate.prototype = NativeDate.prototype;
	Object.setPrototypeOf(VirtualDate, NativeDate);
	(VirtualDate as unknown as { now: () => number }).now = () => EPOCH + now;
	(VirtualDate as unknown as { parse: typeof Date.parse }).parse = NativeDate.parse;
	(VirtualDate as unknown as { UTC: typeof Date.UTC }).UTC = NativeDate.UTC;
	w.Date = VirtualDate as unknown as DateConstructor;

	const toCallback = (cb: unknown): ((...args: unknown[]) => void) => {
		if (typeof cb === "function") return cb as (...args: unknown[]) => void;
		const source = String(cb);
		return () => {
			// String handlers are evaluated globally (indirect eval), as the native timers do.
			const globalEval = w.eval;
			globalEval(source);
		};
	};
	const schedule = (cb: unknown, delay: unknown, args: unknown[], repeat: boolean): number => {
		const id = nextId++;
		const ms = Math.max(0, Number(delay) || 0);
		const interval = repeat ? Math.max(1, ms) : null;
		timers.set(id, {
			due: now + (repeat ? (interval as number) : ms),
			seq: seq++,
			cb: toCallback(cb),
			args,
			interval,
		});
		return id;
	};
	const clear = (id: unknown) => {
		if (typeof id === "number") timers.delete(id);
	};

	w.setTimeout = ((cb: unknown, delay?: unknown, ...args: unknown[]) =>
		schedule(cb, delay, args, false)) as unknown as typeof setTimeout;
	w.setInterval = ((cb: unknown, delay?: unknown, ...args: unknown[]) =>
		schedule(cb, delay, args, true)) as unknown as typeof setInterval;
	w.clearTimeout = clear as typeof clearTimeout;
	w.clearInterval = clear as typeof clearInterval;
	w.requestAnimationFrame = (cb: FrameRequestCallback) => {
		const id = nextId++;
		rafQueue.set(id, cb);
		return id;
	};
	w.cancelAnimationFrame = (id: number) => {
		rafQueue.delete(id);
	};

	const clock = {
		real,
		get now() {
			return now;
		},
		/** Moves virtual time to `ms` without changing the random seed. */
		setTime(ms: number) {
			now = ms;
		},
		setFrame(frame: number, fps: number) {
			now = (frame / fps) * 1000;
			reseed(frame);
		},
		/** Runs every timer due up to the current time, in due order, then one animation frame. */
		runDue(wrap: (fn: () => void) => void) {
			let runs = 0;
			for (;;) {
				let nextKey = -1;
				let next: Timer | null = null;
				for (const [id, t] of timers) {
					if (t.due > now) continue;
					if (next === null || t.due < next.due || (t.due === next.due && t.seq < next.seq)) {
						next = t;
						nextKey = id;
					}
				}
				if (next === null) break;
				if (next.interval === null) timers.delete(nextKey);
				else {
					next.due += next.interval;
					next.seq = seq++;
				}
				const t = next;
				wrap(() => t.cb(...t.args));
				if (++runs > MAX_RUNS) {
					throw new Error(
						`Clock shim: more than ${MAX_RUNS} timers ran for one frame; a timer keeps rescheduling itself at the same time.`,
					);
				}
			}
			const queue = rafQueue;
			rafQueue = new Map();
			for (const cb of queue.values()) wrap(() => cb(now));
		},
		/** Number of pending virtual timers and animation frames, for diagnostics. */
		pending() {
			return { timers: timers.size, animationFrames: rafQueue.size };
		},
	};
	Object.defineProperty(w, "__motioClock", {
		value: clock,
		configurable: false,
		writable: false,
		enumerable: false,
	});
}

/** The shim as a script for `Page.addScriptToEvaluateOnNewDocument`. */
export const CLOCK_SHIM_SCRIPT = `(${installClockShim.toString()})(window);`;
