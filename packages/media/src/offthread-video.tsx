import { type CSSProperties, forwardRef } from "react";
import type { DeprecatedAmplification, MediaAudioProps, PreviewSyncProps } from "./common.js";
import type { DelayRenderProps } from "./media-timeline.js";
import { resolveCommon } from "./normalize.js";
import { failRender } from "./render-errors.js";
import type { MediaTrimProps } from "./timing.js";
import { VideoBase } from "./video-base.js";

/** Props of `<OffthreadVideo>`. */
export interface OffthreadVideoProps
	extends MediaTrimProps,
		MediaAudioProps,
		PreviewSyncProps,
		DelayRenderProps,
		DeprecatedAmplification {
	/** URL of the video, for example from `staticFile()`. */
	src: string;
	/** Speed: 2 plays twice as fast. Positive. Default 1. */
	playbackRate?: number;
	/** Keep the alpha channel of the extracted frames. Default false. */
	transparent?: boolean;
	/** Accepted for compatibility; frames are always converted to sRGB by FFmpeg. */
	toneMapped?: boolean;
	style?: CSSProperties;
	className?: string;
	/** Label in an editor timeline. No effect on rendering. */
	name?: string;
	/** Whether an editor timeline shows this media. No effect on rendering. */
	showInTimeline?: boolean;
	/** Handles a frame that cannot be shown; with it, the render does not fail. */
	onError?: (error: Error) => void;
	/**
	 * Called with each new frame: the `<video>` element in a preview, the `<img>` element showing
	 * the extracted frame in a render.
	 */
	onVideoFrame?: (frame: CanvasImageSource) => void;
	/** `crossOrigin` of the preview `<video>`. Does not apply in renders. */
	crossOrigin?: "anonymous" | "use-credentials";
	/** Removed in Remotion 4.0.0; use `transparent`. */
	imageFormat?: never;
}

/**
 * A video whose frames are extracted outside the browser during a render: the exact source frame
 * (the last one whose timestamp is not after the time, D-015) shown in an `<img>`, so codecs the
 * browser cannot decode work too. In the Player it plays a native `<video>`. Does not loop: wrap
 * it in a `<Loop>` for that.
 */
export const OffthreadVideo = forwardRef<HTMLVideoElement | HTMLImageElement, OffthreadVideoProps>(
	function OffthreadVideo(props, ref) {
		if ((props as { imageFormat?: unknown }).imageFormat !== undefined) {
			throw new TypeError(
				'<OffthreadVideo>: "imageFormat" was removed in Remotion 4.0.0. Pass "transparent" to keep the alpha channel.',
			);
		}
		const common = resolveCommon({ ...props, loop: false }, "OffthreadVideo", {
			preservePitch: true,
		});
		return (
			<VideoBase
				{...common}
				kind="offthread"
				componentName="OffthreadVideo"
				pauseWhenBuffering={props.pauseWhenBuffering === true}
				onAutoPlayError={props.onAutoPlayError}
				style={props.style}
				className={props.className}
				onRenderError={(error) => {
					if (props.onError) props.onError(error);
					else failRender(error);
				}}
				onVideoFrame={props.onVideoFrame}
				transparent={props.transparent === true}
				objectFit="contain"
				headless={false}
				crossOrigin={props.crossOrigin}
				native={{}}
				forwardedRef={ref as never}
			/>
		);
	},
);
