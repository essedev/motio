import { pageWarnings } from "../page-warnings.js";
import type { FrameWarning } from "../protocol.js";
import { SEQUENCE_FROM_ATTRIBUTE } from "../protocol.js";
import { SEQUENCE_RATE_ATTRIBUTE } from "../timeline/sequence.js";

const SELECTOR = `[${SEQUENCE_FROM_ATTRIBUTE}]`;

/** The cumulative playback rate of the nearest enclosing `Sequence` of `target`, 1 outside one. */
function sequenceRate(target: Element | null): number {
	const rate = target?.closest(SELECTOR)?.getAttribute(SEQUENCE_RATE_ATTRIBUTE);
	if (rate === null || rate === undefined) return 1;
	const value = Number(rate);
	return Number.isFinite(value) ? value : 1;
}

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

/** The frame each CSS transition of the page was first seen on: the frame whose render started it. */
const transitionStarts = new WeakMap<Animation, number>();

function isCssTransition(animation: Animation): boolean {
	return typeof CSSTransition === "function" && animation instanceof CSSTransition;
}

const TRANSITION_WARNING: FrameWarning = {
	code: "W_CSS_TRANSITION",
	key: "css-transition",
	message:
		'A CSS transition started while a frame rendered. In the frame model a frame depends on its number only, and a transition depends on the frame before it, so Motio shows its end state at once. Animate with interpolate() or spring() from useCurrentFrame(), or with CSS @keyframes, or render in the virtual time model (timeModel "virtual"), where a transition plays from the frame that changed the style.',
};

/**
 * Pauses every CSS and Web Animation in the document and seeks it to its time at `frame`
 * (ARCHITECTURE, seek step 4). CSS keyframe animations and Web Animations are seeked to the time
 * elapsed since the start of their `Sequence`, deterministic in any order without a clock shim.
 *
 * A CSS transition starts when a style changes, so it depends on what the page rendered before.
 * In the virtual time model every page steps through every frame from 0, so the frame a
 * transition is first seen on is the same on every page: it plays from there. In the frame model
 * there is no such frame (a new page shows the changed style without a transition), so a
 * transition is shown at its end, as a new page would show it, and reported once.
 */
export function seekAnimations(
	frame: number,
	fps: number,
	timeModel: "frame" | "virtual" = "frame",
): FrameWarning[] {
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
			if (isCssTransition(animation)) {
				if (timeModel === "virtual") {
					let start = transitionStarts.get(animation);
					if (start === undefined) {
						start = frame;
						transitionStarts.set(animation, start);
					}
					animation.currentTime = ((frame - start) * sequenceRate(target) * 1000) / fps;
				} else {
					const end = effect?.getComputedTiming().endTime;
					animation.currentTime = typeof end === "number" && Number.isFinite(end) ? end : 0;
					pageWarnings.report(TRANSITION_WARNING);
				}
				continue;
			}
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
