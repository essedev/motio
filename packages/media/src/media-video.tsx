import { type CSSProperties, forwardRef } from "react";
import type { MediaAudioProps } from "./common.js";
import type { DelayRenderProps, MediaSequenceProps } from "./media-timeline.js";
import { cropStyle, resolveCommon } from "./normalize.js";
import type { OffthreadVideoProps } from "./offthread-video.js";
import { failRender } from "./render-errors.js";
import type { ObjectFit } from "./render-frame.js";
import type { MediaTrimProps } from "./timing.js";
import { VideoBase } from "./video-base.js";

/** Log levels of the `@remotion/media` components. */
export type MediaLogLevel = "trace" | "verbose" | "info" | "warn" | "error";

/** The `requestInit` subset the `@remotion/media` components accept. */
export interface MediaRequestInit {
	cache?: RequestCache;
	credentials?: RequestCredentials;
	headers?: Record<string, string> | [string, string][];
	integrity?: string;
	mode?: RequestMode;
	redirect?: RequestRedirect;
	referrer?: string;
	referrerPolicy?: ReferrerPolicy;
}

/** What `onError` of a `@remotion/media` component returns. */
export type MediaErrorAction = "fallback" | "fail";

/** Props of the `@remotion/media` `<Video>`. */
export interface MediaVideoProps
	extends MediaTrimProps,
		MediaAudioProps,
		MediaSequenceProps,
		DelayRenderProps {
	/** URL of the video, for example from `staticFile()`. */
	src: string;
	/** Speed: 2 plays twice as fast; the pitch follows unless `preservePitch`. Default 1. */
	playbackRate?: number;
	/** Loop the video (the `durationInFrames` range when given). */
	loop?: boolean;
	/** Style of the `<canvas>`. */
	style?: CSSProperties;
	className?: string;
	/** How the frame fits the canvas box (the CSS `object-fit` values). Default `"contain"`. */
	objectFit?: ObjectFit;
	/** Mount no canvas; `onVideoFrame` still receives every frame. */
	headless?: boolean;
	/** Called with each new frame: an `ImageBitmap` in a render, the `<video>` in a preview. */
	onVideoFrame?: (frame: CanvasImageSource) => void;
	/** Called when the video cannot be shown. Return `"fail"` to fail the render. */
	onError?: (error: Error) => MediaErrorAction | undefined;
	/** Fail instead of falling back to `<OffthreadVideo>`. */
	disallowFallbackToOffthreadVideo?: boolean;
	/** Props for the `<OffthreadVideo>` fallback. */
	fallbackOffthreadVideoProps?: Partial<OffthreadVideoProps>;
	/** Request options; the renderer reads the file itself, so they apply in a preview only. */
	requestInit?: MediaRequestInit;
	/** Deprecated: use `requestInit`. */
	credentials?: RequestCredentials;
	logLevel?: MediaLogLevel;
	/** Accepted for compatibility; no overlay is drawn. */
	debugOverlay?: boolean;
	/** Preview-only frame size cap in Remotion; previews use the native element here. */
	maxCanvasSinkFrameSize?: { width?: number; height?: number };
	/** Crop ratios from 0 to 1, as on `<Sequence>`. */
	cropLeft?: number;
	cropRight?: number;
	cropTop?: number;
	cropBottom?: number;
	/** Not supported yet: passing effects fails with a clear error. */
	effects?: readonly unknown[];
	effectsOutputSize?: { width: number; height: number };
}

const OBJECT_FITS: readonly ObjectFit[] = ["contain", "cover", "fill", "none", "scale-down"];

/**
 * The `@remotion/media` `<Video>`: in a render, the exact source frame (the `floor` rule, D-015)
 * drawn into a `<canvas>` at the source's size; in the Player, a native `<video>` playing on the
 * real clock.
 */
export const Video = forwardRef<HTMLCanvasElement | HTMLVideoElement, MediaVideoProps>(
	function Video(props, ref) {
		const common = resolveCommon(props, "Video", { preservePitch: false });
		const objectFit = props.objectFit ?? "contain";
		if (!OBJECT_FITS.includes(objectFit)) {
			throw new TypeError(
				`<Video>: "objectFit" must be one of ${OBJECT_FITS.join(", ")}, got ${String(objectFit)}.`,
			);
		}
		if (props.effects && props.effects.length > 0) {
			throw new TypeError(
				'<Video>: "effects" are not supported by Motio yet. Remove them, or apply CSS filters through `style`.',
			);
		}
		const crop = cropStyle(props, "Video");
		const style = crop ? { ...props.style, ...crop } : props.style;
		const fallback = props.fallbackOffthreadVideoProps;
		return (
			<VideoBase
				{...common}
				kind="media"
				componentName="Video"
				pauseWhenBuffering
				onAutoPlayError={fallback?.onAutoPlayError}
				style={style}
				className={props.className}
				onRenderError={(error) => {
					const action = props.onError?.(error) ?? "fallback";
					// The fallback would extract frames the same way and fail the same way; only its
					// own `onError` can keep the render going, as it does for `<OffthreadVideo>`.
					if (
						action === "fallback" &&
						!props.disallowFallbackToOffthreadVideo &&
						fallback?.onError
					) {
						fallback.onError(error);
						return;
					}
					failRender(error);
				}}
				onVideoFrame={props.onVideoFrame}
				transparent
				objectFit={objectFit}
				headless={props.headless === true}
				crossOrigin={fallback?.crossOrigin}
				native={{}}
				forwardedRef={ref as never}
			/>
		);
	},
);
