import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "@motiojs/core";
import { HoldFrame, VideoConfigContext } from "@motiojs/core/internals";
import { type ReactNode, useContext } from "react";
import { checkCount, checkNumber } from "./validate.js";

/** Props of `<Trail>`. */
export interface TrailProps {
	/** Absolutely positioned content, for example an `<AbsoluteFill>`. */
	children: ReactNode;
	/** Copies drawn below the content. An integer. */
	layers: number;
	/** Frames each copy lags behind the one above it; may be fractional. */
	lagInFrames: number;
	/** Opacity of the copy closest to the content; the farthest one is transparent. */
	trailOpacity: number;
}

/**
 * Repeats its children behind themselves at earlier moments, for a trail effect: copy `i` (1 is
 * the closest) shows the frame `i * lagInFrames` earlier, kept within the composition's frames, at an opacity
 * falling from `trailOpacity` to 0. Previously called `<MotionBlur>`. Children must be absolutely
 * positioned.
 */
export function Trail({ children, layers, lagInFrames, trailOpacity }: TrailProps): ReactNode {
	checkCount("layers", layers);
	checkNumber("trailOpacity", trailOpacity);
	checkNumber("lagInFrames", lagInFrames);
	const frame = useCurrentFrame();
	// Sample times stop at the composition's last frame, not the enclosing Sequence's, as in
	// Remotion (useVideoConfig() would give the Sequence's duration).
	useVideoConfig();
	const durationInFrames =
		useContext(VideoConfigContext)?.durationInFrames ?? Number.POSITIVE_INFINITY;
	const copies: ReactNode[] = [];
	for (let i = layers; i >= 1; i--) {
		copies.push(
			<AbsoluteFill key={i} style={{ opacity: trailOpacity - (i / layers) * trailOpacity }}>
				<HoldFrame frame={Math.max(0, Math.min(frame - i * lagInFrames, durationInFrames - 1))}>
					{children}
				</HoldFrame>
			</AbsoluteFill>,
		);
	}
	return (
		<AbsoluteFill>
			{copies}
			{children}
		</AbsoluteFill>
	);
}
