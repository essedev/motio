import type { CSSProperties } from "react";
import type { MediaTrimProps } from "./timing.js";
import type { LoopVolumeCurveBehavior, VolumeProp } from "./volume.js";

/** Audio props shared by every media component. */
export interface MediaAudioProps {
	/** Linear volume, or a function of the frame since the media started. Default 1. */
	volume?: VolumeProp;
	/** How a `volume` function counts frames inside a loop. Default `"repeat"`. */
	loopVolumeCurveBehavior?: LoopVolumeCurveBehavior;
	/** Play no audio; the component stays mounted. May change over time. */
	muted?: boolean;
	/** Pitch factor from 0.01 to 2 (1 is the original pitch). Applied in renders only. */
	toneFrequency?: number;
	/** Zero-based audio stream of the file. Applied in renders only. */
	audioStreamIndex?: number;
	/** Keep the pitch when the playback rate changes. */
	preservePitch?: boolean;
}

/** Props the native media wrappers accept for Player synchronisation. */
export interface PreviewSyncProps {
	/** Drift from the frame's time, in seconds, after which a playing element is seeked. Default 0.45. */
	acceptableTimeShiftInSeconds?: number;
	/** Hold the Player while the element buffers. Default false. */
	pauseWhenBuffering?: boolean;
	/** Called when the browser blocks playback; without it the media is muted and retried once. */
	onAutoPlayError?: () => void;
	/** Accepted for compatibility: volumes above 1 apply in renders, and clamp to 1 in a preview. */
	useWebAudioApi?: boolean;
}

/** Deprecated since Remotion 4.0.279: volumes above 1 are always allowed. Has no effect. */
export interface DeprecatedAmplification {
	allowAmplificationDuringRender?: boolean;
}

/** Keys that are media props, removed before forwarding the rest to a native element. */
export const MEDIA_KEYS = [
	"src",
	"trimBefore",
	"trimAfter",
	"startFrom",
	"endAt",
	"durationInFrames",
	"playbackRate",
	"loop",
	"volume",
	"loopVolumeCurveBehavior",
	"muted",
	"toneFrequency",
	"audioStreamIndex",
	"preservePitch",
	"acceptableTimeShiftInSeconds",
	"pauseWhenBuffering",
	"onAutoPlayError",
	"useWebAudioApi",
	"allowAmplificationDuringRender",
	"name",
	"showInTimeline",
	"delayRenderTimeoutInMilliseconds",
	"delayRenderRetries",
	"onError",
	"onVideoFrame",
	"transparent",
	"toneMapped",
	"crossOrigin",
	"style",
	"className",
	"from",
	"premountFor",
	"postmountFor",
	"styleWhilePremounted",
	"styleWhilePostmounted",
	"freeze",
	"hidden",
	"logLevel",
	"requestInit",
	"credentials",
	"objectFit",
	"headless",
	"debugOverlay",
	"disallowFallbackToOffthreadVideo",
	"fallbackOffthreadVideoProps",
	"disallowFallbackToHtml5Audio",
	"fallbackHtml5AudioProps",
	"maxCanvasSinkFrameSize",
	"cropLeft",
	"cropRight",
	"cropTop",
	"cropBottom",
	"imageFormat",
] as const;

/** The props left after removing every media prop: native attributes to forward. */
export function nativeRest(props: object): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(props)) {
		if (!(MEDIA_KEYS as readonly string[]).includes(k) && k !== "autoPlay" && k !== "controls") {
			out[k] = v;
		}
	}
	return out;
}

const HIDDEN: CSSProperties = { display: "none", pointerEvents: "none" };

/** The element style while premounted or postmounted (hidden, with the overrides on top). */
export function mountedStyle(
	style: CSSProperties | undefined,
	position: { premounted: boolean; postmounted: boolean },
	overrides: { styleWhilePremounted?: CSSProperties; styleWhilePostmounted?: CSSProperties },
): CSSProperties | undefined {
	if (position.premounted) return { ...style, ...HIDDEN, ...overrides.styleWhilePremounted };
	if (position.postmounted) return { ...style, ...HIDDEN, ...overrides.styleWhilePostmounted };
	return style;
}

/** Shared trim and rate props. */
export type TimingInput = MediaTrimProps & { playbackRate?: number };
