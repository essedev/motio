import { createContext } from "react";

/**
 * The resolved configuration of the composition being rendered: what `useVideoConfig()` returns
 * at the top level of the composition.
 */
export interface VideoConfig {
	/** Composition id, the `id` prop of `<Composition>`. */
	id: string;
	width: number;
	height: number;
	fps: number;
	durationInFrames: number;
	/** The `defaultProps` declared on the composition. */
	defaultProps: Record<string, unknown>;
	/** The final props after input props and `calculateMetadata`. */
	props: Record<string, unknown>;
	defaultCodec: string | null;
	defaultOutName: string | null;
	defaultVideoImageFormat: string | null;
	defaultPixelFormat: string | null;
	defaultProResProfile: string | null;
	defaultSampleRate: number | null;
}

/** Provided by the page runtime or the Player around the composition component. */
export const VideoConfigContext = createContext<VideoConfig | null>(null);

/**
 * The timeline as seen by one subtree. Every `Sequence`, `Loop` and `Freeze` derives the state of
 * its children from its parent's state, so nesting composes without global bookkeeping.
 */
export interface TimelineState {
	/** The frame `useCurrentFrame()` returns in this subtree. */
	frame: number;
	/** The end of the subtree in its local frame space: `useVideoConfig().durationInFrames`. */
	durationInFrames: number;
	/** Width override from the nearest `Sequence` with a `width` prop, or null. */
	width: number | null;
	/** Height override from the nearest `Sequence` with a `height` prop, or null. */
	height: number | null;
	/** The absolute composition frame being rendered. */
	absoluteFrame: number;
	/** Absolute composition frame at which the nearest enclosing sequence started. */
	absoluteStart: number;
	/** Child frames per composition frame (product of nested playback rates, 0 when frozen). */
	rate: number;
	/** True inside an active `Freeze` or a `Sequence` with `freeze`. */
	frozen: boolean;
	/** True while the nearest sequence is premounted or postmounted. */
	premounted: boolean;
	postmounted: boolean;
}

/** The timeline state of the current subtree; null outside a composition. */
export const TimelineContext = createContext<TimelineState | null>(null);

/** What `Loop.useLoop()` returns inside a loop. */
export interface LoopInfo {
	/** The duration of one iteration, as passed to the loop. */
	durationInFrames: number;
	/** The current iteration, starting at 0. */
	iteration: number;
}

export const LoopContext = createContext<LoopInfo | null>(null);

/** Scale of the canvas: 1 when rendering, the fit scale in the Player. Null outside. */
export const CurrentScaleContext = createContext<number | null>(null);

/** Name of the enclosing `<Folder>`, if any. */
export interface FolderInfo {
	name: string;
	/** Slash-separated path of the enclosing folders, outermost first. */
	path: string;
}

export const FolderContext = createContext<FolderInfo | null>(null);

/** Builds the timeline state at the top level of a composition. */
export function rootTimelineState(frame: number, durationInFrames: number): TimelineState {
	return {
		frame,
		durationInFrames,
		width: null,
		height: null,
		absoluteFrame: frame,
		absoluteStart: 0,
		rate: 1,
		frozen: false,
		premounted: false,
		postmounted: false,
	};
}
