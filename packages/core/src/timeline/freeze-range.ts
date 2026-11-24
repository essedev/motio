import type { TimelineState } from "./contexts.js";

type FreezeRange = Pick<TimelineState, "compositionDurationInFrames" | "mapOffset" | "mapRate">;

/** The first and last frame of the composition, in the frame space of a subtree. */
function localRange(state: FreezeRange): [first: number, last: number] {
	const last = Math.max(0, state.compositionDurationInFrames - 1);
	return [state.mapOffset, state.mapOffset + last * state.mapRate];
}

/**
 * The frame a freeze at `frame` holds: `frame` itself while it falls on a frame of the
 * composition, else the nearest end of the composition, in the subtree's frame space. A freeze
 * past the end of a 30-frame composition holds frame 29; in a `<Still>` every freeze holds frame
 * 0 (the published Remotion clamps the same way, recorded in `__oracle__/freeze.json`).
 */
export function clampFrozenFrame(state: FreezeRange, frame: number): number {
	const [first, last] = localRange(state);
	if (frame >= first && frame <= last) return frame;
	return frame < first ? first : last;
}

const warned = new Set<string>();

/**
 * Warns once per page that a freeze was moved into the composition, and how to show the frame
 * that was asked for: the content does not disappear, it shows another frame than written.
 */
export function warnClampedFreeze(what: string, requested: number, state: FreezeRange): void {
	const [first, last] = localRange(state);
	const shown = clampFrozenFrame(state, requested);
	const where =
		requested > last
			? `past the end of the composition (its last frame is ${last} here)`
			: `before the start of the composition (its first frame is ${first} here)`;
	const message =
		`${what}: frame ${requested} is ${where}, so the children show frame ${shown} instead (a freeze holds a frame of the composition). ` +
		`Sequences inside count from frame ${shown}, and content that starts later stays hidden. ` +
		`To show frame ${requested} of a scene in a shorter composition or a <Still>, wrap the scene in ` +
		`<Freeze frame={${first}}><Sequence from={${first - requested}}>...</Sequence></Freeze>.`;
	if (warned.has(message)) return;
	warned.add(message);
	console.warn(message);
}
