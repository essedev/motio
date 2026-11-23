import {
	type CSSProperties,
	forwardRef,
	type SyntheticEvent,
	type VideoHTMLAttributes,
} from "react";
import {
	type DeprecatedAmplification,
	type MediaAudioProps,
	nativeRest,
	type PreviewSyncProps,
} from "./common.js";
import type { DelayRenderProps } from "./media-timeline.js";
import { resolveCommon } from "./normalize.js";
import { failRender } from "./render-errors.js";
import type { MediaTrimProps } from "./timing.js";
import { VideoBase } from "./video-base.js";

/** Props of `<Html5Video>`: the native `<video>` attributes plus the media props. */
export interface Html5VideoProps
	extends Omit<
			VideoHTMLAttributes<HTMLVideoElement>,
			| "src"
			| "autoPlay"
			| "controls"
			| "onError"
			| "muted"
			| "loop"
			| "style"
			| "className"
			| "crossOrigin"
		>,
		MediaTrimProps,
		MediaAudioProps,
		PreviewSyncProps,
		DelayRenderProps,
		DeprecatedAmplification {
	/** URL of the video, for example from `staticFile()`. */
	src: string;
	/** Speed: 2 plays twice as fast. Positive. Default 1. */
	playbackRate?: number;
	/** Loop the video (the `durationInFrames` range when given). */
	loop?: boolean;
	style?: CSSProperties;
	className?: string;
	/** Label in an editor timeline. No effect on rendering. */
	name?: string;
	/** Whether an editor timeline shows this media. No effect on rendering. */
	showInTimeline?: boolean;
	/** Handles errors of the element; with it, a failing video does not fail the render. */
	onError?: (event: SyntheticEvent<HTMLVideoElement, Event>) => void;
	/** Called with the `<video>` element whenever it shows a new frame. */
	onVideoFrame?: (frame: CanvasImageSource) => void;
	crossOrigin?: "anonymous" | "use-credentials";
}

/**
 * Wraps the native `<video>` element, synchronised with the timeline (Remotion's `Html5Video`,
 * formerly `Video`). In a render the element is seeked to the middle of the source frame the
 * `nearest` rule selects and the frame waits for `seeked` (D-016); its audio is mixed by the
 * renderer. In the Player it plays on the real clock.
 */
export const Html5Video = forwardRef<HTMLVideoElement, Html5VideoProps>(
	function Html5Video(props, ref) {
		const common = resolveCommon(props, "Html5Video", {
			preservePitch: true,
			sequenceHidden: false,
		});
		const native = nativeRest(props);
		if (props.onError) native.onError = props.onError;
		return (
			<VideoBase
				{...common}
				kind="html5"
				componentName="Html5Video"
				pauseWhenBuffering={props.pauseWhenBuffering === true}
				onAutoPlayError={props.onAutoPlayError}
				style={props.style}
				className={props.className}
				onRenderError={(error) => {
					if (props.onError) console.error(error);
					else failRender(error);
				}}
				onVideoFrame={props.onVideoFrame}
				transparent={false}
				objectFit="contain"
				headless={false}
				crossOrigin={props.crossOrigin}
				native={native}
				forwardedRef={ref as never}
			/>
		);
	},
);
