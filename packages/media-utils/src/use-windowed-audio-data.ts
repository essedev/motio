import { continueRender, delayRender } from "@motiojs/core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isRemoteAsset } from "./is-remote.js";
import type { MediaUtilsAudioData } from "./types.js";
import { failRender } from "./use-audio-data.js";
import { openWindowedSource, type WindowedSource } from "./windowed-source.js";

/** Options of `useWindowedAudioData()`. */
export interface UseWindowedAudioDataOptions {
	src: string;
	frame: number;
	fps: number;
	/** Length of each window. Cannot change after the first render. */
	windowInSeconds: number;
	/** Channel to load. Default 0. */
	channelIndex?: number;
	/** Passed to the range requests. Only the value of the first render is used. */
	requestInit?: RequestInit;
}

/** Return value of `useWindowedAudioData()`. */
export interface UseWindowedAudioDataReturnValue {
	/** The loaded windows around the frame, one channel, or null until loaded. */
	audioData: MediaUtilsAudioData | null;
	/** Start time of `audioData` in the file; pass it to the visualization functions. */
	dataOffsetInSeconds: number;
}

/** Index of the window containing `frame`, and the indices to load around it. */
export function windowsAround(
	frame: number,
	fps: number,
	windowInSeconds: number,
	durationInSeconds: number,
): { current: number; needed: number[] } {
	const count = Math.ceil(durationInSeconds / windowInSeconds);
	const current = Math.floor(frame / fps / windowInSeconds);
	const needed = [current - 1, current, current + 1].filter((w) => w >= 0 && w < count);
	return { current, needed };
}

function windowKey(src: string, channel: number, w: number): string {
	return `${src}|${channel}|${w}`;
}

/** Sample frames `[from, to)` of window `w`; windows tile the file without gaps or overlaps. */
export function windowRange(
	w: number,
	windowInSeconds: number,
	sampleRate: number,
	frames: number,
): [number, number] {
	const from = Math.min(frames, Math.round(w * windowInSeconds * sampleRate));
	const to = Math.min(frames, Math.round((w + 1) * windowInSeconds * sampleRate));
	return [from, to];
}

/** The windows to return: the loaded ones if contiguous, else the run around `current`. */
export function contiguousLoaded(
	needed: number[],
	loaded: (w: number) => boolean,
	current: number,
): number[] {
	const available = needed.filter(loaded);
	const contiguous = available.every((w, i) => i === 0 || w === (available[i - 1] as number) + 1);
	if (contiguous) return available;
	return loaded(current) ? [current] : [];
}

/**
 * Loads only the audio around the current frame: the window containing it plus the previous and
 * next one, each `windowInSeconds` long, so long files never sit in memory whole. WAV files are
 * read with HTTP Range requests at their own sample rate; other formats are decoded whole once at
 * 48 kHz and sliced. The render waits for the windows it needs, and fails if the file cannot be
 * loaded or lacks `channelIndex`. Pass `dataOffsetInSeconds` to `visualizeAudio()`,
 * `visualizeAudioWaveform()` or `getWaveformPortion()`.
 */
export function useWindowedAudioData(
	options: UseWindowedAudioDataOptions,
): UseWindowedAudioDataReturnValue {
	const { src, frame, fps, windowInSeconds, channelIndex = 0 } = options;
	const initialWindow = useRef(windowInSeconds).current;
	if (windowInSeconds !== initialWindow) {
		throw new Error("windowInSeconds cannot be changed dynamically");
	}
	const requestInit = useRef(options.requestInit).current;
	const [source, setSource] = useState<{ src: string; source: WindowedSource } | null>(null);
	const windows = useRef(new Map<string, Float32Array>());
	const [, setVersion] = useState(0);

	// Open the source (header) once per src.
	useLayoutEffect(() => {
		let current = true;
		const handle = delayRender(`Waiting for the audio header of "${src}"`);
		openWindowedSource(src, requestInit)
			.then((opened) => {
				if (!current) return;
				if (channelIndex >= opened.numberOfChannels || channelIndex < 0) {
					throw new Error(
						`Invalid channel index ${channelIndex} for audio with ${opened.numberOfChannels} channels`,
					);
				}
				setSource({ src, source: opened });
			})
			.catch((err: unknown) => {
				if (current) failRender(err);
			})
			.finally(() => continueRender(handle));
		return () => {
			current = false;
			continueRender(handle);
		};
	}, [src, channelIndex, requestInit]);

	const opened = source?.src === src ? source.source : null;
	const plan = opened ? windowsAround(frame, fps, windowInSeconds, opened.durationInSeconds) : null;
	const neededKey = plan?.needed.join(",") ?? "";

	// Load the missing windows around the frame and drop the others.
	useLayoutEffect(() => {
		if (!opened || neededKey === "") return;
		const needed = neededKey.split(",").map(Number);
		const keep = new Set(needed.map((w) => windowKey(src, channelIndex, w)));
		for (const key of windows.current.keys()) if (!keep.has(key)) windows.current.delete(key);
		const missing = needed.filter((w) => !windows.current.has(windowKey(src, channelIndex, w)));
		if (missing.length === 0) return;
		let current = true;
		const handle = delayRender(`Waiting for audio windows ${missing.join(", ")} of "${src}"`);
		Promise.all(
			missing.map(async (w) => {
				const [from, to] = windowRange(w, windowInSeconds, opened.sampleRate, opened.frames);
				const samples = await opened.read(channelIndex, from, to);
				if (current) windows.current.set(windowKey(src, channelIndex, w), samples);
			}),
		)
			.then(() => {
				if (current) setVersion((v) => v + 1);
			})
			.catch((err: unknown) => {
				if (current) failRender(err);
			})
			.finally(() => continueRender(handle));
		return () => {
			current = false;
			continueRender(handle);
		};
	}, [opened, neededKey, src, channelIndex, windowInSeconds]);

	const shown =
		opened && plan
			? contiguousLoaded(
					plan.needed,
					(w) => windows.current.has(windowKey(src, channelIndex, w)),
					plan.current,
				)
			: [];
	const shownKey = shown.join(",");
	const resultId = `${src}-windows-${shownKey}`;

	// biome-ignore lint/correctness/useExhaustiveDependencies: the data changes only with resultId
	const audioData = useMemo((): MediaUtilsAudioData | null => {
		if (!opened || shown.length === 0) return null;
		const parts = shown.map(
			(w) => windows.current.get(windowKey(src, channelIndex, w)) as Float32Array,
		);
		const length = parts.reduce((n, p) => n + p.length, 0);
		const merged = new Float32Array(length);
		let at = 0;
		for (const part of parts) {
			merged.set(part, at);
			at += part.length;
		}
		return {
			channelWaveforms: [merged],
			sampleRate: opened.sampleRate,
			durationInSeconds: opened.durationInSeconds,
			numberOfChannels: 1,
			resultId,
			isRemote: isRemoteAsset(src),
		};
	}, [resultId, opened]);

	useEffect(() => {
		// Free the windows when the component unmounts.
		const current = windows.current;
		return () => current.clear();
	}, []);

	return {
		audioData,
		dataOffsetInSeconds: shown.length > 0 ? (shown[0] as number) * windowInSeconds : 0,
	};
}
