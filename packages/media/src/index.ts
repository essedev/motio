/**
 * Media components. The root mirrors `@remotion/media` (`Video`, `Audio`); the components of
 * the `remotion` package (`Html5Video`, `OffthreadVideo`, `Html5Audio`) are exported here too and
 * re-exported by `motio` under Remotion's names.
 */
export type {
	DeprecatedAmplification,
	MediaAudioProps,
	PreviewSyncProps,
} from "./common.js";
export { Html5Audio, type Html5AudioProps } from "./html5-audio.js";
export { Html5Video, type Html5VideoProps } from "./html5-video.js";
export {
	Audio,
	Audio as experimental_Audio,
	type MediaAudioComponentProps as AudioProps,
} from "./media-audio.js";
export type { DelayRenderProps, MediaSequenceProps } from "./media-timeline.js";
export {
	type MediaErrorAction,
	type MediaLogLevel,
	type MediaRequestInit,
	type MediaVideoProps as VideoProps,
	Video,
	Video as experimental_Video,
} from "./media-video.js";
export { OffthreadVideo, type OffthreadVideoProps } from "./offthread-video.js";
export type { ObjectFit } from "./render-frame.js";
export type { MediaTrimProps } from "./timing.js";
export type { LoopVolumeCurveBehavior, VolumeProp } from "./volume.js";
