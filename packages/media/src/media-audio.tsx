import { type CSSProperties, forwardRef } from "react";
import { AudioBase } from "./audio-base.js";
import type { MediaAudioProps } from "./common.js";
import type { Html5AudioProps } from "./html5-audio.js";
import type { DelayRenderProps, MediaSequenceProps } from "./media-timeline.js";
import type { MediaErrorAction, MediaLogLevel, MediaRequestInit } from "./media-video.js";
import { resolveCommon } from "./normalize.js";
import type { MediaTrimProps } from "./timing.js";

/** Props of the `@remotion/media` `<Audio>`. */
export interface MediaAudioComponentProps
	extends MediaTrimProps,
		MediaAudioProps,
		MediaSequenceProps,
		DelayRenderProps {
	/** URL of the audio, for example from `staticFile()`. */
	src: string;
	/** Speed: 2 plays twice as fast; the pitch follows unless `preservePitch`. Default 1. */
	playbackRate?: number;
	/** Loop the audio (the `durationInFrames` range when given). */
	loop?: boolean;
	/** Style of the native `<audio>` element. */
	style?: CSSProperties;
	/** Called when the audio cannot be played. Return `"fail"` to fail the render. */
	onError?: (error: Error) => MediaErrorAction | undefined;
	/** Fail instead of falling back to `<Html5Audio>`. */
	disallowFallbackToHtml5Audio?: boolean;
	/** Props for the `<Html5Audio>` fallback; the preview sync props apply to the native element. */
	fallbackHtml5AudioProps?: Pick<
		Partial<Html5AudioProps>,
		| "onError"
		| "useWebAudioApi"
		| "acceptableTimeShiftInSeconds"
		| "pauseWhenBuffering"
		| "crossOrigin"
		| "preservePitch"
	>;
	/** Request options; the renderer reads the file itself, so they apply in a preview only. */
	requestInit?: MediaRequestInit;
	/** Deprecated: use `requestInit`. */
	credentials?: RequestCredentials;
	logLevel?: MediaLogLevel;
}

/**
 * The `@remotion/media` `<Audio>`: in a render it reports what it plays on each frame and the
 * renderer mixes it (D-014), with the pitch following `playbackRate` unless `preservePitch`; in
 * the Player a native `<audio>` plays on the real clock.
 */
export const Audio = forwardRef<HTMLAudioElement, MediaAudioComponentProps>(
	function Audio(props, ref) {
		const fallback = props.fallbackHtml5AudioProps;
		const common = resolveCommon(
			{
				...props,
				...(fallback?.acceptableTimeShiftInSeconds === undefined
					? {}
					: { acceptableTimeShiftInSeconds: fallback.acceptableTimeShiftInSeconds }),
			},
			"Audio",
			{ preservePitch: false },
		);
		return (
			<AudioBase
				{...common}
				componentName="Audio"
				pauseWhenBuffering={fallback?.pauseWhenBuffering ?? true}
				useSharedAudioTag={false}
				style={props.style}
				crossOrigin={fallback?.crossOrigin}
				native={{}}
				forwardedRef={ref}
			/>
		);
	},
);
