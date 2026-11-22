import type { ReactNode } from "react";
import { TimelineContext } from "./contexts.js";
import { useTimeline } from "./hooks.js";

/** Props of `<Freeze>`. */
export interface FreezeProps {
	/** The frame the children see, whatever the enclosing sequences. */
	frame: number;
	/** `false` disables freezing; a function decides per frame from the parent frame. Default true. */
	active?: boolean | ((frame: number) => boolean);
	children?: ReactNode;
}

/**
 * Freezes its children at `frame`: `useCurrentFrame()` returns `frame` inside, irrespective of any
 * `Sequence`.
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
	return (
		<TimelineContext.Provider value={{ ...parent, frame, rate: 0, frozen: true }}>
			{children}
		</TimelineContext.Provider>
	);
}
