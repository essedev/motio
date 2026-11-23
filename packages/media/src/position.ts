import { useVideoConfig } from "@motiojs/core";
import { LoopContext, TimelineContext } from "@motiojs/core/internals";
import { useContext } from "react";

/** Where a media component is on its timeline at the current frame. */
export interface MediaPosition {
	/** Position in the source, in seconds. */
	time: number;
	/** Position in the source, in composition frames. */
	sourceFrame: number;
	/** Source frames per composition frame, including enclosing rates; 0 when held. */
	rate: number;
	/** Frames since the media started, on its parent's timeline, in the current loop iteration. */
	sinceStart: number;
	/** Frames since the media started, counting every loop iteration. */
	sinceStartTotal: number;
	premounted: boolean;
	postmounted: boolean;
	fps: number;
}

/**
 * Reads the media's position from the timeline `MediaTimeline` set up: the child frame is the
 * source position in composition frames.
 */
export function useMediaPosition(
	trimBefore: number,
	playbackRate: number,
	looping: boolean,
	component: string,
): MediaPosition {
	const timeline = useContext(TimelineContext);
	const loop = useContext(LoopContext);
	const { fps } = useVideoConfig();
	if (!timeline) throw new Error(`<${component}> must be rendered inside a composition.`);
	const sinceStart = (timeline.frame - trimBefore) / playbackRate;
	const iterationLength = loop ? loop.durationInFrames / (looping ? playbackRate : 1) : 0;
	return {
		time: timeline.frame / fps,
		sourceFrame: timeline.frame,
		rate: timeline.rate,
		sinceStart,
		sinceStartTotal: loop ? sinceStart + loop.iteration * iterationLength : sinceStart,
		premounted: timeline.premounted,
		postmounted: timeline.postmounted,
		fps,
	};
}
