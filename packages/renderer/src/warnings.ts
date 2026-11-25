import type { FrameWarning } from "@motiojs/core/protocol";

/**
 * A warning about the render, in the result of `renderMedia()`, `renderStill()` and
 * `renderFrames()`. Codes: `W_FONT_FALLBACK` (text fell back to another font),
 * `W_SLOW_READINESS` (a `delayRender()` handle stayed open more than half its timeout),
 * `W_ANIMATION_UNSEEKABLE`, `W_MATH_RANDOM` (frames call `Math.random()`),
 * `W_CSS_TRANSITION` (frame model: a CSS transition is shown at its end),
 * `W_ANIMATION_FRAME_LOOP` (frame model: a `requestAnimationFrame` loop runs on the real clock),
 * `W_STATIC_FILE_CASE` (a `staticFile()` name differs in case from the file),
 * `W_TIMELINE_SHORT` (a `<TransitionSeries>` ends before the composition) and
 * `W_FFMPEG_FALLBACK` (the pinned FFmpeg could not be downloaded; the one on PATH was used).
 */
export interface RenderWarning {
	code: string;
	message: string;
	/** The first frame the warning was reported on, when it came from a frame. */
	frame?: number;
}

/**
 * Collects the warnings of a render (one composition), each once, in the order first seen, with
 * the first frame it was reported on. A warning is identified by its code and its `key`, else
 * its message: the copies every page reports, and messages with values that vary (a duration),
 * collapse into one entry that keeps the first message.
 */
export class WarningCollector {
	private readonly byKey = new Map<string, RenderWarning>();

	/** Adds the warnings of one frame, or of the render as a whole when `frame` is undefined. */
	add(warnings: readonly (FrameWarning | RenderWarning)[], frame?: number): void {
		for (const w of warnings) {
			const key = `${w.code}\u0000${("key" in w && w.key) || w.message}`;
			const existing = this.byKey.get(key);
			if (existing) {
				if (frame !== undefined && (existing.frame === undefined || frame < existing.frame)) {
					existing.frame = frame;
				}
				continue;
			}
			const entry: RenderWarning = { code: w.code, message: w.message };
			if (frame !== undefined) entry.frame = frame;
			this.byKey.set(key, entry);
		}
	}

	/** The warnings collected so far. */
	list(): RenderWarning[] {
		return [...this.byKey.values()].map((w) => ({ ...w }));
	}
}

/**
 * A `delayRender()` handle the render is waiting on, reported every few seconds through
 * `onDelayRenderPending` until it is released or times out.
 */
export interface PendingDelayRender {
	/** The label passed to `delayRender()`, or null. */
	label: string | null;
	/** The frame being rendered; null while the compositions are listed or metadata resolves. */
	frame: number | null;
	/** The composition being rendered, or null while the compositions are listed. */
	compositionId: string | null;
	/** Milliseconds since the handle was opened. */
	elapsedMs: number;
	/** The handle's timeout in milliseconds. */
	timeoutMs: number;
}
