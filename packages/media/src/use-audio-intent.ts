import { audioIntents } from "@motiojs/core/internals";
import { useLayoutEffect, useRef } from "react";
import { absoluteSrc } from "./media-service.js";
import type { MediaPosition } from "./position.js";

/** What a media component plays on the current frame. */
export interface AudioIntentOptions {
	/** False outside a render, and for media that plays no audio. */
	enabled: boolean;
	src: string;
	position: MediaPosition;
	/** Volume on this frame, already evaluated. */
	volume: number;
	muted: boolean;
	toneFrequency: number;
	preservePitch: boolean;
	audioStreamIndex: number | null;
}

/**
 * Reports the component's audio for the frame being rendered (`FrameReport.audio`). Nothing is
 * reported while muted, silent, held (frozen, premounted, postmounted) or outside a render; the
 * renderer mixes the reported frames offline (D-014).
 */
export function useAudioIntent(options: AudioIntentOptions): void {
	const owner = useRef<object>({});
	const { enabled, src, position, volume, muted, toneFrequency, preservePitch } = options;
	const active = enabled && !muted && volume > 0 && position.rate > 0;
	const sourceFrame = position.sourceFrame;
	const rate = position.rate;
	const stream = options.audioStreamIndex;

	useLayoutEffect(() => {
		const token = owner.current;
		if (!active) {
			audioIntents.delete(token);
			return;
		}
		audioIntents.set(token, {
			src: absoluteSrc(src),
			sourceFrame,
			playbackRate: rate,
			toneFrequency,
			preservePitch,
			volume,
			audioStreamIndex: stream,
		});
	}, [active, src, sourceFrame, rate, toneFrequency, preservePitch, volume, stream]);

	useLayoutEffect(() => {
		const token = owner.current;
		return () => audioIntents.delete(token);
	}, []);
}
