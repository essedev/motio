import {
	type AudioHTMLAttributes,
	type CSSProperties,
	forwardRef,
	type SyntheticEvent,
} from "react";
import { AudioBase } from "./audio-base.js";
import {
	type DeprecatedAmplification,
	type MediaAudioProps,
	nativeRest,
	type PreviewSyncProps,
} from "./common.js";
import type { DelayRenderProps } from "./media-timeline.js";
import { resolveCommon } from "./normalize.js";
import type { MediaTrimProps } from "./timing.js";

/** Props of `<Html5Audio>`: the native `<audio>` attributes plus the media props. */
export interface Html5AudioProps
	extends Omit<
			AudioHTMLAttributes<HTMLAudioElement>,
			"src" | "autoPlay" | "controls" | "onError" | "muted" | "loop" | "style" | "crossOrigin"
		>,
		MediaTrimProps,
		MediaAudioProps,
		PreviewSyncProps,
		DelayRenderProps,
		DeprecatedAmplification {
	/** URL of the audio, for example from `staticFile()`. */
	src: string;
	/** Speed: 2 plays twice as fast, with the pitch kept. Positive. Default 1. */
	playbackRate?: number;
	/** Loop the audio (the `durationInFrames` range when given). */
	loop?: boolean;
	style?: CSSProperties;
	/** Label in an editor timeline. No effect on rendering. */
	name?: string;
	/** Whether an editor timeline shows this media. No effect on rendering. */
	showInTimeline?: boolean;
	/** Handles errors of the element. */
	onError?: (event: SyntheticEvent<HTMLAudioElement, Event>) => void;
	crossOrigin?: "anonymous" | "use-credentials";
}

/**
 * Plays an audio file in sync with the timeline (Remotion's `Html5Audio`, formerly `Audio`). In
 * a render nothing plays in the browser: the component reports what it plays on each frame and
 * the renderer mixes it (D-014). In the Player a native `<audio>` plays on the real clock, taken
 * from the Player's shared audio tags when it has some.
 */
export const Html5Audio = forwardRef<HTMLAudioElement, Html5AudioProps>(
	function Html5Audio(props, ref) {
		const common = resolveCommon(props, "Html5Audio", {
			preservePitch: true,
			sequenceHidden: false,
		});
		const native = nativeRest(props);
		if (props.onError) native.onError = props.onError;
		return (
			<AudioBase
				{...common}
				componentName="Html5Audio"
				pauseWhenBuffering={props.pauseWhenBuffering === true}
				useSharedAudioTag
				style={props.style}
				crossOrigin={props.crossOrigin}
				native={native}
				forwardedRef={ref}
			/>
		);
	},
);
