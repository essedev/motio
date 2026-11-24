import type { ReactNode } from "react";
import { TimelineContext } from "./contexts.js";
import { clampFrozenFrame, warnClampedFreeze } from "./freeze-range.js";
import { useTimeline } from "./hooks.js";

/** Props of `<Freeze>`. */
export interface FreezeProps {
	/**
	 * The frame the children see, whatever the enclosing sequences. A frame outside the composition
	 * is held at its nearest end (with a warning), as Remotion does.
	 */
	frame: number;
	/** `false` disables freezing; a function decides per frame from the parent frame. Default true. */
	active?: boolean | ((frame: number) => boolean);
	children?: ReactNode;
}

/**
 * Freezes its children at `frame`: `useCurrentFrame()` returns `frame` inside, irrespective of any
 * `Sequence`. The frame is held inside the composition: past its end (always, in a `<Still>`),
 * the children see its last frame, and a warning says how to show a later frame of a scene.
 */
export function Freeze({ frame, active = true, children }: FreezeProps): ReactNode {
	const parent = useTimeline("<Freeze>");
	if (typeof frame !== "number" || !Number.isFinite(frame)) {
		throw new Error(`<Freeze>: "frame" must be a finite number, got ${String(frame)}.`);
	}
	if (typeof active !== "boolean" && typeof active !== "function") {
		throw new Error(`<Freeze>: "active" must be a boolean or a function, got ${typeof active}.`);
	}
	const isActive = typeof active === "function" ? active(parent.frame) : active;
	if (!isActive) return children;
	const held = clampFrozenFrame(parent, frame);
	if (held !== frame) warnClampedFreeze("<Freeze>", frame, parent);
	return <HoldFrame frame={held}>{children}</HoldFrame>;
}

/**
 * Holds its children at `frame` as given, even outside the composition: the building block of
 * components that sample other frames of their children (`@motiojs/motion-blur`), whose recorded
 * Remotion counterparts are not held inside the composition as `<Freeze>` is.
 */
export function HoldFrame({ frame, children }: { frame: number; children?: ReactNode }): ReactNode {
	const parent = useTimeline("<Freeze>");
	return (
		<TimelineContext.Provider value={{ ...parent, frame, rate: 0, frozen: true }}>
			{children}
		</TimelineContext.Provider>
	);
}
