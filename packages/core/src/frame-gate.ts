/**
 * The animation-frame gate of the frame time model (ARCHITECTURE, "Time"). The renderer injects
 * `FRAME_GATE_SCRIPT` with `Page.addScriptToEvaluateOnNewDocument` before any page script, only
 * when `timeModel` is `"frame"`; the virtual model's clock shim owns `requestAnimationFrame`
 * instead.
 *
 * Renders run Chrome without its frame rate limit, so a `requestAnimationFrame` loop left running
 * on the real clock calls back as fast as Chrome can draw. A loop that draws a canvas on every
 * call kept Chrome so busy that a screenshot waited seconds for its frame. The gate lets the
 * page's animation-frame callbacks run while a frame renders and settles, and holds the ones that
 * come due between the end of one seek and the start of the next (the capture, and the time the
 * page waits for its next frame); they run when the next seek starts. Timestamps stay those of
 * the real clock. Nothing else is patched.
 */

/** Callbacks in a row that asked for another animation frame before a loop is reported. */
export const FRAME_LOOP_CALLS = 30;

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
	const nativeTimeout = w.setTimeout.bind(w);
	type Entry = { cb: FrameRequestCallback; native: number | null };
	const entries = new Map<number, Entry>();
	let nextId = 1;
	let open = true;
	let running = 0;
	let rearmed = false;
	let loopCalls = 0;
	let loop = false;

	const arm = (id: number, entry: Entry) => {
		entry.native = nativeRequest((time) => {
			if (!open) {
				// Held until the next seek opens the gate.
				entry.native = null;
				return;
			}
			entries.delete(id);
			running++;
			rearmed = false;
			try {
				entry.cb(time);
			} finally {
				running--;
				loopCalls = rearmed ? loopCalls + 1 : 0;
				if (loopCalls >= LOOP_CALLS) loop = true;
			}
		});
	};

	let closing = false;
	w.requestAnimationFrame = (cb: FrameRequestCallback): number => {
		const id = nextId++;
		const entry: Entry = { cb, native: null };
		entries.set(id, entry);
		if (running > 0) rearmed = true;
		if (open && !closing) arm(id, entry);
		return id;
	};
	w.cancelAnimationFrame = (id: number): void => {
		const entry = entries.get(id);
		if (!entry) return;
		if (entry.native !== null) nativeCancel(entry.native);
		entries.delete(id);
	};

	const gate = {
		/** Lets animation-frame callbacks run, and asks a frame for the ones held. */
		open() {
			if (open) return;
			open = true;
			for (const [id, entry] of entries) if (entry.native === null) arm(id, entry);
		},
		/**
		 * Holds the animation-frame callbacks until the next `open()`. Callbacks already requested
		 * from Chrome run first, in the next animation frame; those they request are held. A request
		 * left pending, or cancelled, while the renderer captures made each capture wait about one
		 * frame interval more (18 ms against 1 ms measured).
		 */
		async close(): Promise<void> {
			closing = true;
			try {
				const pending = [...entries.values()].some((entry) => entry.native !== null);
				// Bounded, in case Chrome draws no frame (a page under BeginFrame control between pumps).
				if (pending) {
					await new Promise<void>((resolve) => {
						nativeRequest(() => resolve());
						nativeTimeout(resolve, CLOSE_WAIT_MS);
					});
				}
			} finally {
				closing = false;
				open = false;
			}
		},
		/** True once a callback asked for the next animation frame `FRAME_LOOP_CALLS` times in a row. */
		get loop() {
			return loop;
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
	open(): void;
	close(): Promise<void>;
	readonly loop: boolean;
}

/** The installed gate, or null (virtual time model, preview, Player). */
export function getFrameGate(): FrameGate | null {
	const value = (globalThis as Record<string, unknown>).__motioFrameGate;
	return value && typeof value === "object" ? (value as FrameGate) : null;
}
