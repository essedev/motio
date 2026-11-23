import { useSyncExternalStore } from "react";
import { absoluteSrc } from "./media-service.js";

/**
 * Media durations learned on the page: from the renderer's media service during a render, from
 * a native element's metadata in a preview. Looping media needs the duration of its source
 * before it can compute where each iteration starts.
 */
const durations = new Map<string, number>();
const listeners = new Set<() => void>();

/** Records the duration of `src` in seconds. */
export function reportDuration(src: string, seconds: number): void {
	if (!(seconds > 0) || !Number.isFinite(seconds)) return;
	const key = absoluteSrc(src);
	if (durations.get(key) === seconds) return;
	durations.set(key, seconds);
	for (const l of [...listeners]) l();
}

/** The known duration of `src` in seconds, or null. */
export function knownDuration(src: string): number | null {
	return durations.get(absoluteSrc(src)) ?? null;
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** The known duration of `src`, re-rendering when it becomes known. */
export function useKnownDuration(src: string): number | null {
	return useSyncExternalStore(
		subscribe,
		() => knownDuration(src),
		() => knownDuration(src),
	);
}
