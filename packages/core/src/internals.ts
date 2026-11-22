/**
 * Building blocks for other Motio packages (the Player, media components, feature packages).
 * Not part of the Remotion-compatible API and not re-exported by `motio`.
 */
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
export { STATIC_BASE_GLOBAL, STATIC_FILES_GLOBAL } from "./static-file.js";
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
export { type BufferHandle, BufferStateContext, useTimeline } from "./timeline/hooks.js";
export {
	computeSequence,
	SEQUENCE_RATE_ATTRIBUTE,
	SequenceBase,
	type SequenceComputation,
	type SequencePhase,
	type SequenceTimingProps,
	validateTimingProps,
} from "./timeline/sequence.js";
