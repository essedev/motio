import { createContext, useContext, useMemo } from "react";
import {
	CurrentScaleContext,
	TimelineContext,
	type TimelineState,
	type VideoConfig,
	VideoConfigContext,
} from "./contexts.js";

const OUTSIDE =
	"can only be called inside a component that is rendered as part of a composition " +
	"(registered with <Composition>, or rendered in a Player).";

/** The timeline state of the calling subtree; throws outside a composition. */
export function useTimeline(hook: string): TimelineState {
	const state = useContext(TimelineContext);
	if (!state) throw new Error(`${hook} ${OUTSIDE}`);
	return state;
}

/**
 * The current frame, 0-indexed, relative to the start of the nearest enclosing `Sequence`
 * (after its `trimBefore` and `playbackRate`), or the frame frozen by a `Freeze`.
 */
export function useCurrentFrame(): number {
	return useTimeline("useCurrentFrame()").frame;
}

/**
 * The configuration of the enclosing composition. Inside a `Sequence`, `durationInFrames` is the
 * end of the sequence in its local frame space and `width`/`height` follow the nearest `Sequence`
 * that overrides them.
 */
export function useVideoConfig(): VideoConfig {
	const config = useContext(VideoConfigContext);
	const timeline = useContext(TimelineContext);
	if (!config) throw new Error(`useVideoConfig() ${OUTSIDE}`);
	return useMemo(() => {
		if (!timeline) return config;
		const durationInFrames = timeline.durationInFrames;
		const width = timeline.width ?? config.width;
		const height = timeline.height ?? config.height;
		if (
			durationInFrames === config.durationInFrames &&
			width === config.width &&
			height === config.height
		) {
			return config;
		}
		return { ...config, durationInFrames, width, height };
	}, [config, timeline]);
}

/** Options of `useCurrentScale()`. */
export interface UseCurrentScaleOptions {
	/** Return 1 instead of throwing when called outside a composition. */
	dontThrowIfOutsideOfRemotion?: boolean;
}

/** The scale of the canvas: 1 when rendering, the fit scale in the Player. */
export function useCurrentScale(options?: UseCurrentScaleOptions): number {
	const scale = useContext(CurrentScaleContext);
	if (scale === null) {
		if (options?.dontThrowIfOutsideOfRemotion) return 1;
		throw new Error(
			`useCurrentScale() ${OUTSIDE} Pass { dontThrowIfOutsideOfRemotion: true } to get 1 instead.`,
		);
	}
	return scale;
}

/** A playback block returned by `useBufferState().delayPlayback()`. */
export interface BufferHandle {
	/** Lets playback resume. Calling it again has no effect. */
	unblock: () => void;
}

/** What `useBufferState()` returns. */
export interface BufferState {
	/** Tells the Player that data is loading, pausing playback until `unblock()`. */
	delayPlayback: () => BufferHandle;
}

const NO_OP_BUFFER: BufferState = {
	delayPlayback: () => ({ unblock: () => {} }),
};

/** Provided by the Player; rendering uses the no-op default. */
export const BufferStateContext = createContext<BufferState>(NO_OP_BUFFER);

/**
 * Lets a component pause Player playback while it loads data. A no-op when rendering, where
 * `delayRender()` blocks the capture instead.
 */
export function useBufferState(): BufferState {
	return useContext(BufferStateContext);
}
