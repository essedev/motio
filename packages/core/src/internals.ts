/**
 * Building blocks for other Motio packages (the Player, media components, feature packages).
 * Not part of the Remotion-compatible API and not re-exported by `@motiojs/motio`.
 */
export {
	AssetError,
	type AssetErrorCode,
	describeMissingAsset,
	isAssetError,
	type MissingAsset,
	missingAssetDetails,
	nearestName,
	probeStatus,
	staticPathOf,
	suggestionText,
} from "./asset-error.js";
export {
	CompositionFrame,
	type CompositionFrameProps,
	SUSPENSE_LABEL,
} from "./composition/composition-frame.js";
export {
	CompositionRegistry,
	CompositionRegistryContext,
	type CompositionSelection,
	CompositionSelectionContext,
} from "./composition/manager.js";
export { getRoot, resetRoot, waitForRoot } from "./composition/register-root.js";
export {
	CalculateMetadataError,
	type ResolveOptions,
	resolveComposition,
	toCompositionInfo,
} from "./composition/resolve.js";
export type { AnyComponent, RegisteredComposition, SchemaLike } from "./composition/types.js";
export {
	getRunContext,
	RemotionEnvironmentContext,
	registerPlayerMount,
} from "./environment.js";
export {
	type AudioIntentInput,
	AudioIntentRegistry,
	audioIntents,
} from "./media/audio-intents.js";
export {
	type MediaPlayback,
	MediaPlaybackContext,
	type SharedAudioPool,
	useMediaPlayback,
} from "./media/playback-context.js";
export { PageWarningRegistry, pageWarnings } from "./page-warnings.js";
export { parseColor, type Rgba8 } from "./parse-color.js";
export { getPrefetchedUrl } from "./prefetch.js";
export {
	type ClosedHandle,
	DEFAULT_READINESS_TIMEOUT_MS,
	type ExpiredHandle,
	type ReadinessHandle,
	ReadinessRegistry,
	readiness,
} from "./readiness/registry.js";
export { getVirtualClock, type RealTimers, realTimers, type VirtualClock } from "./real-time.js";
export { BUNDLE_GLOBAL, STATIC_BASE_GLOBAL, STATIC_FILES_GLOBAL } from "./static-file.js";
export {
	CurrentScaleContext,
	FolderContext,
	type FolderInfo,
	LoopContext,
	rootTimelineState,
	TimelineContext,
	type TimelineState,
	VideoConfigContext,
} from "./timeline/contexts.js";
export { HoldFrame } from "./timeline/freeze.js";
export { type BufferHandle, BufferStateContext, useTimeline } from "./timeline/hooks.js";
export {
	computeSequence,
	cropClipPath,
	SEQUENCE_RATE_ATTRIBUTE,
	SequenceBase,
	type SequenceComputation,
	type SequencePhase,
	type SequenceTimingProps,
	validateTimingProps,
} from "./timeline/sequence.js";
