import { spring, useCurrentFrame, useVideoConfig } from "@motiojs/motio";
import { BRAND_SPRING, CALM_SPRING } from "./tokens";

/** The brand spring (overshoot) at the current frame, starting after `delay` frames. */
export const useBrandSpring = (delay = 0) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	return spring({ frame, fps, delay, config: BRAND_SPRING });
};

/** The calm spring (no bounce) stretched to `duration` frames, starting after `delay`. */
export const useCalmSpring = (delay = 0, duration = 15) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	return spring({ frame, fps, delay, config: CALM_SPRING, durationInFrames: duration });
};

/** Frame at which every entrance of a scene has settled; stills freeze their scene here. */
export const REST_FRAME = 90;
