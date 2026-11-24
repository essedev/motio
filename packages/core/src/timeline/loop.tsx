import { type CSSProperties, forwardRef, type ReactNode, useContext } from "react";
import { LoopContext, type LoopInfo } from "./contexts.js";
import { useTimeline } from "./hooks.js";
import { SequenceBase } from "./sequence.js";

/** Props of `<Loop>`. */
export interface LoopProps {
	/** Length of one iteration in parent frames. */
	durationInFrames: number;
	/** How many iterations. Default `Infinity`. */
	times?: number;
	/** Speed of the children inside each iteration; an iteration still lasts `durationInFrames`. */
	playbackRate?: number;
	layout?: "absolute-fill" | "none";
	style?: CSSProperties;
	className?: string;
	/** Label in an editor timeline. Default `"<Loop>"`. */
	name?: string;
	showInTimeline?: boolean;
	premountFor?: number;
	postmountFor?: number;
	styleWhilePremounted?: CSSProperties;
	styleWhilePostmounted?: CSSProperties;
	children?: ReactNode;
}

const LoopImpl = forwardRef<HTMLDivElement, LoopProps>(function Loop(props, ref) {
	const {
		durationInFrames,
		times = Number.POSITIVE_INFINITY,
		playbackRate = 1,
		name = "<Loop>",
		children,
		...rest
	} = props;
	const parent = useTimeline("<Loop>");
	if (
		typeof durationInFrames !== "number" ||
		!Number.isFinite(durationInFrames) ||
		durationInFrames <= 0
	) {
		throw new Error(
			`<Loop>: "durationInFrames" must be a positive finite number, got ${String(durationInFrames)}.`,
		);
	}
	if (typeof times !== "number" || Number.isNaN(times) || times < 0) {
		throw new Error(`<Loop>: "times" must be a non-negative number, got ${String(times)}.`);
	}
	if (times === 0) return null;
	const raw = Math.floor(parent.frame / durationInFrames);
	const iteration = Math.max(0, Math.min(raw, times - 1));
	const info: LoopInfo = { durationInFrames, iteration };
	return (
		<LoopContext.Provider value={info}>
			<SequenceBase
				{...rest}
				ref={ref}
				name={name}
				componentName="Loop"
				timelineLoop={{ durationInFrames, times }}
				from={iteration * durationInFrames}
				durationInFrames={durationInFrames * playbackRate}
				playbackRate={playbackRate}
			>
				{children}
			</SequenceBase>
		</LoopContext.Provider>
	);
});

/** Returns the innermost loop's duration and current iteration, or null outside a loop. */
function useLoop(): LoopInfo | null {
	return useContext(LoopContext);
}

/** Repeats its children every `durationInFrames` frames, `times` times (default forever). */
export const Loop: typeof LoopImpl & { useLoop: typeof useLoop } = Object.assign(LoopImpl, {
	useLoop,
});
