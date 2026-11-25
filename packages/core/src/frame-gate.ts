/**
 * The frame gate of the frame time model (ARCHITECTURE, "Time"). The renderer injects
 * `FRAME_GATE_SCRIPT` with `Page.addScriptToEvaluateOnNewDocument` before any page script, only
 * when `timeModel` is `"frame"`; the virtual model's clock shim owns these functions instead.
 *
 * It wraps `requestAnimationFrame`, `setTimeout` and `setInterval` (and their cancel functions),
 * never `MessageChannel`, `queueMicrotask` or `Promise`, which React's scheduler runs on.
 *
 * - **Between seeks.** Renders run Chrome without its frame rate limit, so a
 *   `requestAnimationFrame` loop left running on the real clock calls back as fast as Chrome can
 *   draw: a loop that drew a canvas on every call kept Chrome so busy that a screenshot waited
 *   seconds for its frame. The page's callbacks run while a frame renders and settles; those that
 *   come due between the end of one seek and the start of the next (the capture, and the time the
 *   page waits for its next frame) are held and run when the next seek starts. Timers are held the
 *   same way, so nothing the page schedules changes it while it is captured; an interval that
 *   came due several times while held runs once.
 * - **Loops.** A callback that schedules the next one (an animation frame asking for another, a
 *   `setTimeout` chain, an interval) `FRAME_LOOP_CALLS` times in a row is a loop. A timer loop that
 *   changed the DOM on every call kept the settle loop from ever seeing a quiet DOM, and the frame
 *   timed out: the settle loop observes the callbacks (`observe`) and ignores the DOM changes a
 *   detected loop makes.
 *
 * Timestamps and delays stay those of the real clock: what a loop draws still differs between
 * renders, which the page reports.
 */

/** Callbacks in a row that scheduled the next one before a loop is reported. */
export const FRAME_LOOP_CALLS = 30;

/** What the settle loop is told around each callback the gate runs. */
export interface FrameGateObserver {
	/** Before a page callback runs. */
	before(): void;
	/** After it ran; `loop` is true when it is an iteration of a detected loop. */
	after(loop: boolean): void;
}

/**
 * Installs the gate on `win`. Self-contained on purpose: it is serialised with
 * `Function.prototype.toString` into `FRAME_GATE_SCRIPT`, so it may not reference anything outside
 * its own body.
 */
export function installFrameGate(win: Window & typeof globalThis): void {
	const w = win as unknown as Record<string, unknown> & Window & typeof globalThis;
	if (w.__motioFrameGate) return;
	const LOOP_CALLS = 30; // FRAME_LOOP_CALLS, inlined: the function must be self-contained.
	const CLOSE_WAIT_MS = 100; // Longest wait of close() for the animation frame requested.
	const nativeRequest = w.requestAnimationFrame.bind(w);
	const nativeCancel = w.cancelAnimationFrame.bind(w);
	const nativeSetTimeout = w.setTimeout.bind(w);
	const nativeClearTimeout = w.clearTimeout.bind(w);
	const nativeSetInterval = w.setInterval.bind(w);
	const nativeClearInterval = w.clearInterval.bind(w);
	const perf = w.performance;
	const NativeDate = w.Date;
	const real = {
		setTimeout: nativeSetTimeout,
		clearTimeout: nativeClearTimeout,
		requestAnimationFrame: nativeRequest,
		now: perf.now.bind(perf),
		dateNow: NativeDate.now.bind(NativeDate),
	};

	let open = true;
	let closing = false;
	let observer: { before(): void; after(loop: boolean): void } | null = null;

	/** Consecutive callbacks of one kind that scheduled the next one, and whether that made a loop. */
	type LoopState = { calls: number; loop: boolean };
	const frames: LoopState = { calls: 0, loop: false };
	const timers: LoopState = { calls: 0, loop: false };
	/** Callbacks running, and whether one of them scheduled a callback of the kind being tracked. */
	let runningFrame = 0;
	let runningTimer = 0;
	let frameRearmed = false;
	let timerRearmed = false;

	const run = (state: LoopState, iteration: () => boolean, fn: () => void) => {
		observer?.before();
		let loop = false;
		try {
			fn();
		} finally {
			const again = iteration();
			state.calls = again ? state.calls + 1 : 0;
			if (state.calls >= LOOP_CALLS) state.loop = true;
			loop = again && state.loop;
			observer?.after(loop);
		}
	};

	// Animation frames.
	type Frame = { cb: FrameRequestCallback; native: number | null };
	const frameEntries = new Map<number, Frame>();
	let nextFrameId = 1;
	const armFrame = (id: number, entry: Frame) => {
		entry.native = nativeRequest((time) => {
			if (!open) {
				// Held until the next seek opens the gate.
				entry.native = null;
				return;
			}
			frameEntries.delete(id);
			runningFrame++;
			frameRearmed = false;
			run(
				frames,
				() => frameRearmed,
				() => {
					try {
						entry.cb(time);
					} finally {
						runningFrame--;
					}
				},
			);
		});
	};
	w.requestAnimationFrame = (cb: FrameRequestCallback): number => {
		const id = nextFrameId++;
		const entry: Frame = { cb, native: null };
		frameEntries.set(id, entry);
		if (runningFrame > 0) frameRearmed = true;
		if (open && !closing) armFrame(id, entry);
		return id;
	};
	w.cancelAnimationFrame = (id: number): void => {
		const entry = frameEntries.get(id);
		if (!entry) return;
		if (entry.native !== null) nativeCancel(entry.native);
		frameEntries.delete(id);
	};

	// Timers. Ids are the gate's own; clearTimeout and clearInterval clear either kind, as in
	// browsers.
	type Timer = {
		cb: (...args: unknown[]) => void;
		args: unknown[];
		interval: boolean;
		native: number | null;
		/** Came due while the gate was closed. */
		held: boolean;
		/** The task that runs it once the gate opened, until it ran. */
		release: number | null;
	};
	const timerEntries = new Map<number, Timer>();
	let nextTimerId = 1;
	const toCallback = (cb: unknown): ((...args: unknown[]) => void) => {
		if (typeof cb === "function") return cb as (...args: unknown[]) => void;
		const source = String(cb);
		return () => {
			// String handlers are evaluated globally (indirect eval), as the native timers do.
			const globalEval = w.eval;
			globalEval(source);
		};
	};
	const fire = (id: number, entry: Timer) => {
		if (!open) {
			entry.held = true;
			return;
		}
		// An interval whose period came again before its release ran runs once, not twice.
		if (entry.release !== null) {
			nativeClearTimeout(entry.release);
			entry.release = null;
		}
		if (!entry.interval) timerEntries.delete(id);
		runningTimer++;
		timerRearmed = false;
		run(
			timers,
			() => entry.interval || timerRearmed,
			() => {
				try {
					entry.cb.apply(w, entry.args);
				} finally {
					runningTimer--;
				}
			},
		);
	};
	const schedule = (cb: unknown, delay: unknown, args: unknown[], interval: boolean): number => {
		const id = nextTimerId++;
		const entry: Timer = {
			cb: toCallback(cb),
			args,
			interval,
			native: null,
			held: false,
			release: null,
		};
		timerEntries.set(id, entry);
		if (runningTimer > 0) timerRearmed = true;
		const ms = Number(delay) || 0;
		entry.native = interval
			? nativeSetInterval(() => fire(id, entry), ms)
			: nativeSetTimeout(() => fire(id, entry), ms);
		return id;
	};
	const clear = (id: unknown) => {
		if (typeof id !== "number") return;
		const entry = timerEntries.get(id);
		if (!entry) return;
		if (entry.native !== null) {
			if (entry.interval) nativeClearInterval(entry.native);
			else nativeClearTimeout(entry.native);
		}
		if (entry.release !== null) nativeClearTimeout(entry.release);
		timerEntries.delete(id);
	};
	w.setTimeout = ((cb: unknown, delay?: unknown, ...args: unknown[]) =>
		schedule(cb, delay, args, false)) as unknown as typeof setTimeout;
	w.setInterval = ((cb: unknown, delay?: unknown, ...args: unknown[]) =>
		schedule(cb, delay, args, true)) as unknown as typeof setInterval;
	w.clearTimeout = clear as typeof clearTimeout;
	w.clearInterval = clear as typeof clearInterval;

	const gate = {
		real,
		/** Lets callbacks run; asks a frame for the animation frames held and runs the timers held. */
		open() {
			if (open) return;
			open = true;
			for (const [id, entry] of frameEntries) if (entry.native === null) armFrame(id, entry);
			for (const [id, entry] of timerEntries) {
				if (!entry.held) continue;
				entry.held = false;
				// A timeout held is still in the map; an interval runs once, then keeps its period.
				entry.release = nativeSetTimeout(() => {
					entry.release = null;
					if (timerEntries.get(id) === entry) fire(id, entry);
				}, 0);
			}
		},
		/**
		 * Holds the callbacks until the next `open()`. Animation frames already requested from Chrome
		 * run first, in the next animation frame; those they request are held. A request left
		 * pending, or cancelled, while the renderer captures made each capture wait about one frame
		 * interval more (18 ms against 1 ms measured). Timers that come due from now on are held.
		 */
		async close(): Promise<void> {
			closing = true;
			try {
				const pending = [...frameEntries.values()].some((entry) => entry.native !== null);
				// Bounded, in case Chrome draws no frame (a page under BeginFrame control between pumps).
				if (pending) {
					await new Promise<void>((resolve) => {
						nativeRequest(() => resolve());
						nativeSetTimeout(resolve, CLOSE_WAIT_MS);
					});
				}
			} finally {
				closing = false;
				open = false;
			}
		},
		/** Receives `before` and `after` around every page callback the gate runs; null stops. */
		observe(next: { before(): void; after(loop: boolean): void } | null) {
			observer = next;
		},
		/** True once an animation-frame callback asked for the next frame `FRAME_LOOP_CALLS` times in a row. */
		get loop() {
			return frames.loop;
		},
		/** True once timer callbacks scheduled the next one `FRAME_LOOP_CALLS` times in a row. */
		get timerLoop() {
			return timers.loop;
		},
	};
	Object.defineProperty(w, "__motioFrameGate", {
		value: gate,
		configurable: false,
		writable: false,
		enumerable: false,
	});
}

/** The gate as a script for `Page.addScriptToEvaluateOnNewDocument`. */
export const FRAME_GATE_SCRIPT = `(${installFrameGate.toString()})(window);`;

/** The controller the gate installs as `window.__motioFrameGate`. */
export interface FrameGate {
	/** The browser's own timers and clock, which the gate never holds. */
	real: {
		setTimeout: (cb: () => void, ms: number) => number;
		clearTimeout: (id: number) => void;
		requestAnimationFrame: (cb: (t: number) => void) => number;
		now: () => number;
		dateNow: () => number;
	};
	open(): void;
	close(): Promise<void>;
	observe(observer: FrameGateObserver | null): void;
	readonly loop: boolean;
	readonly timerLoop: boolean;
}

/** The installed gate, or null (virtual time model, preview, Player). */
export function getFrameGate(): FrameGate | null {
	const value = (globalThis as Record<string, unknown>).__motioFrameGate;
	return value && typeof value === "object" ? (value as FrameGate) : null;
}
