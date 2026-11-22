import type { FrameWarning } from "../protocol.js";
import { SEQUENCE_FROM_ATTRIBUTE } from "../protocol.js";
import { SEQUENCE_RATE_ATTRIBUTE } from "../timeline/sequence.js";

const SELECTOR = `[${SEQUENCE_FROM_ATTRIBUTE}]`;

/**
 * The animation time, in milliseconds, of an element at composition frame `frame`: the time
 * elapsed since the start of its nearest enclosing `Sequence` (read from `data-motio-from`),
 * scaled by the sequence's cumulative playback rate.
 */
export function animationTimeFor(target: Element | null, frame: number, fps: number): number {
	const seq = target?.closest(SELECTOR) ?? null;
	if (!seq) return (frame / fps) * 1000;
	const from = Number(seq.getAttribute(SEQUENCE_FROM_ATTRIBUTE));
	const rateAttr = seq.getAttribute(SEQUENCE_RATE_ATTRIBUTE);
	const rate = rateAttr === null ? 1 : Number(rateAttr);
	if (!Number.isFinite(from) || !Number.isFinite(rate)) return (frame / fps) * 1000;
	return (Math.max(0, frame - from) * rate * 1000) / fps;
}

/**
 * Pauses every CSS and Web Animation in the document and seeks it to its time at `frame`
 * (ARCHITECTURE, seek step 4). Deterministic in any order, without a clock shim.
 */
export function seekAnimations(frame: number, fps: number): FrameWarning[] {
	if (typeof document === "undefined" || typeof document.getAnimations !== "function") return [];
	const warnings: FrameWarning[] = [];
	for (const animation of document.getAnimations()) {
		const effect = animation.effect;
		const target = effect instanceof KeyframeEffect ? effect.target : null;
		if (animation.timeline !== null && animation.timeline !== document.timeline) {
			warnings.push({
				code: "W_ANIMATION_UNSEEKABLE",
				message: `An animation${animation.id ? ` "${animation.id}"` : ""} runs on a scroll or view timeline and cannot follow the frame.`,
			});
			continue;
		}
		try {
			animation.pause();
			animation.currentTime = animationTimeFor(target, frame, fps);
		} catch (err) {
			warnings.push({
				code: "W_ANIMATION_UNSEEKABLE",
				message: `Could not seek an animation: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	}
	return warnings;
}
