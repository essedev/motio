import { cancelRender, continueRender, delayRender } from "@motiojs/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DEFAULT_SAMPLE_RATE, getAudioData } from "./get-audio-data.js";
import type { MediaUtilsAudioData } from "./types.js";

/** Options of `useAudioData()`. */
export interface UseAudioDataOptions {
	/** Sample rate the audio is decoded to. Default 48000. */
	sampleRate?: number;
	/** Passed to `fetch()`. Only the value of the first render is used. */
	requestInit?: RequestInit;
}

/**
 * Fails the render with `err`. `cancelRender()` records the failure for the renderer and rethrows
 * it by contract; called from a promise callback the rethrow has no caller to reach, so it stops
 * here instead of surfacing as an unhandled rejection.
 */
export function failRender(err: unknown): void {
	try {
		cancelRender(err);
	} catch {
		// Already recorded by cancelRender(); see above.
	}
}

interface Loaded {
	key: string;
	data: MediaUtilsAudioData;
}

/**
 * Loads `src` with `getAudioData()` and returns the data, or null until it is loaded. The render
 * waits for it (`delayRender()`), and fails if the file cannot be loaded or has no audio track.
 * When `src` or `sampleRate` changes, the previous data stays until the new load finishes, and the
 * results or errors of the superseded load are ignored. Unmounting releases the pending wait.
 */
export function useAudioData(
	src: string,
	options?: UseAudioDataOptions,
): MediaUtilsAudioData | null {
	const sampleRate = options?.sampleRate ?? DEFAULT_SAMPLE_RATE;
	const requestInit = useRef(options?.requestInit).current;
	const [loaded, setLoaded] = useState<Loaded | null>(null);
	const pending = useRef<{ key: string; handle: number } | null>(null);
	const key = `${sampleRate}|${src}`;

	useLayoutEffect(() => {
		let current = true;
		const handle = delayRender(`Waiting for audio data of "${src}" to be loaded`);
		pending.current = { key, handle };
		const release = () => {
			if (pending.current?.handle === handle) pending.current = null;
			continueRender(handle);
		};
		getAudioData(src, requestInit === undefined ? { sampleRate } : { sampleRate, requestInit })
			.then((data) => {
				if (!current) return;
				// The handle is released once this state is committed (effect below).
				setLoaded({ key, data });
			})
			.catch((err: unknown) => {
				if (!current) return;
				release();
				failRender(err);
			});
		return () => {
			current = false;
			release();
		};
	}, [key, src, sampleRate, requestInit]);

	useEffect(() => {
		const open = pending.current;
		if (open !== null && loaded?.key === open.key) {
			pending.current = null;
			continueRender(open.handle);
		}
	}, [loaded]);

	return loaded?.data ?? null;
}
