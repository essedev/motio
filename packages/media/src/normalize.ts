import type { CSSProperties } from "react";
import type { MediaAudioProps, PreviewSyncProps } from "./common.js";
import type { DelayRenderProps, MediaSequenceProps, MediaTimelineProps } from "./media-timeline.js";
import { type MediaTrimProps, type ResolvedTrim, resolveTrim } from "./timing.js";
import {
	type LoopVolumeCurveBehavior,
	type VolumeProp,
	validateAudioStreamIndex,
	validateTimeShift,
	validateToneFrequency,
	validateVolumeProp,
} from "./volume.js";

type Loose<T> = { [K in keyof T]?: T[K] | undefined };

/** Props every media component goes through before rendering. */
export type CommonInput = Loose<
	MediaTrimProps & MediaAudioProps & PreviewSyncProps & DelayRenderProps & MediaSequenceProps
> & {
	src: string;
	playbackRate?: number | undefined;
	loop?: boolean | undefined;
};

/** The validated common props. */
export interface CommonResolved {
	src: string;
	trim: ResolvedTrim;
	playbackRate: number;
	loop: boolean;
	volume: VolumeProp | undefined;
	loopVolumeCurveBehavior: LoopVolumeCurveBehavior;
	muted: boolean;
	toneFrequency: number;
	preservePitch: boolean;
	audioStreamIndex: number | null;
	acceptableTimeShiftInSeconds: number | undefined;
	sequence: Omit<
		MediaTimelineProps,
		"src" | "trim" | "playbackRate" | "loop" | "isRendering" | "componentName" | "children"
	>;
}

/** Validates and normalises the props shared by every media component. */
export function resolveCommon(
	props: CommonInput,
	component: string,
	defaults: { preservePitch: boolean; sequenceHidden?: boolean },
): CommonResolved {
	if (typeof props.src !== "string" || props.src.length === 0) {
		throw new TypeError(`<${component}> needs a "src" string, got ${JSON.stringify(props.src)}.`);
	}
	validateVolumeProp(props.volume, component);
	validateToneFrequency(props.toneFrequency, component);
	validateAudioStreamIndex(props.audioStreamIndex, component);
	validateTimeShift(props.acceptableTimeShiftInSeconds, component);
	const behavior = props.loopVolumeCurveBehavior ?? "repeat";
	if (behavior !== "repeat" && behavior !== "extend") {
		throw new TypeError(
			`<${component}>: "loopVolumeCurveBehavior" must be "repeat" or "extend", got ${String(behavior)}.`,
		);
	}
	const playbackRate = props.playbackRate ?? 1;
	if (typeof playbackRate !== "number" || !Number.isFinite(playbackRate) || playbackRate <= 0) {
		throw new TypeError(
			`<${component}>: "playbackRate" must be a positive finite number (reverse playback is not supported), got ${String(playbackRate)}.`,
		);
	}
	const sequence: CommonResolved["sequence"] = {};
	for (const key of [
		"from",
		"premountFor",
		"postmountFor",
		"styleWhilePremounted",
		"styleWhilePostmounted",
		"freeze",
		"hidden",
		"name",
		"showInTimeline",
		"delayRenderTimeoutInMilliseconds",
		"delayRenderRetries",
	] as const) {
		if (key === "hidden" && defaults.sequenceHidden === false) continue;
		if (props[key] !== undefined) (sequence as Record<string, unknown>)[key] = props[key];
	}
	return {
		src: props.src,
		trim: resolveTrim(props, component),
		playbackRate,
		loop: props.loop === true,
		volume: props.volume,
		loopVolumeCurveBehavior: behavior,
		muted: props.muted === true,
		toneFrequency: props.toneFrequency ?? 1,
		preservePitch: props.preservePitch ?? defaults.preservePitch,
		audioStreamIndex: props.audioStreamIndex ?? null,
		acceptableTimeShiftInSeconds: props.acceptableTimeShiftInSeconds,
		sequence,
	};
}

/** The crop props as a `clip-path`, or null when nothing is cropped. */
export function cropStyle(
	crop: { cropLeft?: number; cropRight?: number; cropTop?: number; cropBottom?: number },
	component: string,
): CSSProperties | null {
	const values = {
		left: crop.cropLeft ?? 0,
		right: crop.cropRight ?? 0,
		top: crop.cropTop ?? 0,
		bottom: crop.cropBottom ?? 0,
	};
	for (const [key, v] of Object.entries(values)) {
		if (typeof v !== "number" || !(v >= 0 && v <= 1)) {
			throw new TypeError(
				`<${component}>: "crop${key[0]?.toUpperCase()}${key.slice(1)}" must be a number from 0 to 1, got ${String(v)}.`,
			);
		}
	}
	if (values.left + values.right + values.top + values.bottom === 0) return null;
	const pct = (n: number) => `${Number((n * 100).toFixed(6))}%`;
	return {
		clipPath: `inset(${pct(values.top)} ${pct(values.right)} ${pct(values.bottom)} ${pct(values.left)})`,
	};
}
