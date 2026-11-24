export {
	Composition,
	type CompositionProps,
	Still,
	type StillProps,
} from "./composition/composition.js";
export { Folder, type FolderProps } from "./composition/folder.js";
export { registerRoot } from "./composition/register-root.js";
export type {
	CalculateMetadataFunction,
	CalculateMetadataOptions,
	CalculateMetadataResult,
} from "./composition/types.js";
export { Easing, type EasingFunction } from "./easing.js";
export type { EasingSpringConfig, SpringEasingFunction } from "./easing-spring.js";
export {
	getInputProps,
	getRemotionEnvironment,
	type RemotionEnvironment,
	useRemotionEnvironment,
} from "./environment.js";
export { isHtmlInCanvasSupported } from "./html-in-canvas.js";
export {
	Interactive,
	type InteractiveBaseProps,
	type InteractiveComponent,
	type InteractiveCreateOptions,
	type InteractiveCropProps,
	type InteractiveElement,
	type InteractiveElementProps,
	type InteractivePremountProps,
	type InteractiveProps,
	type InteractiveTransformProps,
	type InteractivitySchema,
	type InteractivitySchemaField,
	type WithSchemaOptions,
} from "./interactive.js";
export { absoluteFillSchema } from "./interactive-schema.js";
export {
	assertValidInterpolateEasingOption,
	assertValidInterpolatePosterizeOption,
	type ExtrapolateType,
	type InterpolateOptions,
	type InterpolateOutput,
	type InterpolateOutputType,
	interpolate,
} from "./interpolate.js";
export { type InterpolateColorsOptions, interpolateColors } from "./interpolate-colors.js";
export {
	AnimatedImage,
	type AnimatedImageFillMode,
	type AnimatedImageLoopBehavior,
	type AnimatedImageProps,
} from "./media/animated-image.js";
export { IFrame, type IFrameProps } from "./media/iframe.js";
export { Img, type ImgProps } from "./media/img.js";
export {
	type PrefetchOnProgress,
	type PrefetchOptions,
	type PrefetchResult,
	prefetch,
} from "./prefetch.js";
export { random } from "./random.js";
export {
	cancelRender,
	continueRender,
	type DelayRenderOptions,
	delayRender,
	useDelayRender,
} from "./readiness/delay-render.js";
export { measureSpring, type SpringConfig, spring } from "./spring.js";
export {
	getStaticFiles,
	type StaticFile,
	staticFile,
	type WatchStaticFileHandle,
	watchStaticFile,
} from "./static-file.js";
export { AbsoluteFill, type AbsoluteFillProps } from "./timeline/absolute-fill.js";
export type { LoopInfo, VideoConfig } from "./timeline/contexts.js";
export { Freeze, type FreezeProps } from "./timeline/freeze.js";
export {
	type BufferState,
	useBufferState,
	useCurrentFrame,
	useCurrentScale,
	useVideoConfig,
} from "./timeline/hooks.js";
export { Loop, type LoopProps } from "./timeline/loop.js";
export { Sequence, type SequenceProps } from "./timeline/sequence.js";
export { Series, type SeriesProps, type SeriesSequenceProps } from "./timeline/series.js";
export { REMOTION_API_VERSION, VERSION } from "./version.js";
