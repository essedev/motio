import type { BufferState } from "@motiojs/core";
import type { MediaPlayback } from "@motiojs/core/internals";
import { useEffect, useLayoutEffect, useRef } from "react";
import { reportDuration } from "./durations.js";

/** Default of `acceptableTimeShiftInSeconds`. */
export const DEFAULT_TIME_SHIFT_S = 0.45;

/** Range of `HTMLMediaElement.playbackRate` Chrome accepts. */
const MIN_NATIVE_RATE = 0.0625;
const MAX_NATIVE_RATE = 16;

/** Tolerance for a paused element to count as showing the requested time. */
const PAUSED_TOLERANCE_S = 0.001;

/** Inputs of `useMediaSync()`. */
export interface MediaSyncOptions {
	/** False during a render: the element is then driven by the render path. */
	enabled: boolean;
	src: string;
	/** Source time the current frame shows, in seconds. */
	time: number;
	/** Source frames per composition frame from the timeline; 0 while held. */
	rate: number;
	/** Component volume on this frame. */
	volume: number;
	muted: boolean;
	playback: MediaPlayback | null;
	acceptableTimeShiftInSeconds: number;
	preservePitch: boolean;
	/** Hold the Player while the element buffers. */
	pauseWhenBuffering: boolean;
	buffer: BufferState;
	/** Called when the browser refuses to play; without it the element is muted and retried once. */
	onAutoPlayError?: (() => void) | undefined;
	component: string;
}

function clampRate(rate: number): number {
	return Math.min(MAX_NATIVE_RATE, Math.max(MIN_NATIVE_RATE, rate));
}

/**
 * Keeps a native media element in step with the Player (preview mode). Paused, the element is
 * seeked to the current frame's time. Playing, it plays on the real clock at the Player's rate
 * times its own, and is seeked again only when it drifts more than
 * `acceptableTimeShiftInSeconds` from the frame. Volume is the component's volume times the
 * Player's, clamped to the element's 0 to 1 range; the Player's mute applies on top.
 */
export function useMediaSync(element: HTMLMediaElement | null, options: MediaSyncOptions): void {
	const { enabled, time, rate, playback, buffer } = options;
	const retried = useRef(false);
	/** Set once the autoplay policy forced the element to play muted. */
	const forcedMute = useRef(false);
	const latest = useRef(options);
	latest.current = options;

	useLayoutEffect(() => {
		if (!enabled || !element) return;
		const o = latest.current;
		const playerVolume = playback ? playback.volume : 1;
		element.volume = Math.min(1, Math.max(0, o.volume * playerVolume));
		element.muted = o.muted || (playback?.muted ?? false) || forcedMute.current;
		if ("preservesPitch" in element) element.preservesPitch = o.preservePitch;

		const duration = Number.isFinite(element.duration) ? element.duration : null;
		const target = duration !== null ? Math.min(time, duration) : time;
		const pastEnd = duration !== null && time >= duration;
		// Media elements cannot play backwards: with a negative Player rate they follow the frames.
		const playerRate = playback?.playbackRate ?? 1;
		const shouldPlay = (playback?.playing ?? false) && rate > 0 && playerRate > 0 && !pastEnd;

		if (!shouldPlay) {
			if (!element.paused) element.pause();
			if (Math.abs(element.currentTime - target) > PAUSED_TOLERANCE_S) {
				element.currentTime = target;
			}
			return;
		}
		element.playbackRate = clampRate(rate * playerRate);
		if (element.paused || element.ended) {
			if (Math.abs(element.currentTime - target) > PAUSED_TOLERANCE_S) {
				element.currentTime = target;
			}
			const refused = (err: unknown) => {
				if ((err as { name?: string })?.name !== "NotAllowedError") return;
				const handler = latest.current.onAutoPlayError;
				if (handler) {
					handler();
					return;
				}
				if (retried.current) return;
				retried.current = true;
				console.warn(
					`<${latest.current.component}> with src=${latest.current.src} could not play with sound because of the browser's autoplay policy; playing it muted.`,
				);
				forcedMute.current = true;
				element.muted = true;
				// Still refused while muted: the element stays paused on the frame.
				Promise.resolve(element.play()).catch(() => undefined);
			};
			// Older engines return undefined instead of a promise.
			Promise.resolve(element.play()).catch(refused);
			return;
		}
		if (Math.abs(element.currentTime - target) > o.acceptableTimeShiftInSeconds) {
			element.currentTime = target;
		}
	});

	// Durations for looping, and buffering for the Player.
	useEffect(() => {
		if (!enabled || !element) return;
		const onMetadata = () => reportDuration(latest.current.src, element.duration);
		if (element.readyState >= 1) onMetadata();
		element.addEventListener("loadedmetadata", onMetadata);
		let block: { unblock: () => void } | null = null;
		const onWaiting = () => {
			if (!latest.current.pauseWhenBuffering || block) return;
			block = buffer.delayPlayback();
		};
		const onReady = () => {
			block?.unblock();
			block = null;
		};
		element.addEventListener("waiting", onWaiting);
		element.addEventListener("playing", onReady);
		element.addEventListener("canplay", onReady);
		element.addEventListener("seeked", onReady);
		return () => {
			element.removeEventListener("loadedmetadata", onMetadata);
			element.removeEventListener("waiting", onWaiting);
			element.removeEventListener("playing", onReady);
			element.removeEventListener("canplay", onReady);
			element.removeEventListener("seeked", onReady);
			onReady();
		};
	}, [enabled, element, buffer]);

	// Stop the element when the component unmounts or leaves preview mode.
	useEffect(() => {
		if (!enabled || !element) return;
		return () => {
			element.pause();
		};
	}, [enabled, element]);
}
