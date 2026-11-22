import { type ReactNode, Suspense, useLayoutEffect, useMemo } from "react";
import { continueRender, delayRender } from "../readiness/delay-render.js";
import {
	CurrentScaleContext,
	rootTimelineState,
	TimelineContext,
	type VideoConfig,
	VideoConfigContext,
} from "../timeline/contexts.js";
import type { AnyComponent } from "./types.js";

/** Label of the readiness handle held while the root `Suspense` fallback is mounted. */
export const SUSPENSE_LABEL = "<Suspense> fallback of the composition";

/** Holds a readiness handle while mounted, so a suspended tree blocks the capture. */
function SuspenseHold(): null {
	useLayoutEffect(() => {
		const handle = delayRender(SUSPENSE_LABEL);
		return () => continueRender(handle);
	}, []);
	return null;
}

/** Props of `CompositionFrame`. */
export interface CompositionFrameProps {
	component: AnyComponent;
	config: VideoConfig;
	/** Absolute composition frame. */
	frame: number;
	/** Canvas scale: 1 when rendering. */
	scale?: number;
	children?: ReactNode;
}

/**
 * Renders a composition component at a frame with every context the timeline hooks need. Shared
 * by the page runtime and the Player.
 */
export function CompositionFrame({
	component: Component,
	config,
	frame,
	scale = 1,
}: CompositionFrameProps): ReactNode {
	const timeline = useMemo(
		() => rootTimelineState(frame, config.durationInFrames),
		[frame, config.durationInFrames],
	);
	return (
		<VideoConfigContext.Provider value={config}>
			<CurrentScaleContext.Provider value={scale}>
				<TimelineContext.Provider value={timeline}>
					<Suspense fallback={<SuspenseHold />}>
						<Component {...config.props} />
					</Suspense>
				</TimelineContext.Provider>
			</CurrentScaleContext.Provider>
		</VideoConfigContext.Provider>
	);
}
