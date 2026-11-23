import { cancelRender, continueRender, delayRender, useVideoConfig } from "@motiojs/core";
import { SequenceBase, type SequenceTimingProps } from "@motiojs/core/internals";
import { type CSSProperties, type ReactNode, useLayoutEffect } from "react";
import { reportDuration, useKnownDuration } from "./durations.js";
import { mediaInfo } from "./media-service.js";
import { loopLength, type ResolvedTrim } from "./timing.js";

/** Sequence props the `@remotion/media` components accept on top of the trim props. */
export interface MediaSequenceProps {
	from?: number;
	premountFor?: number;
	postmountFor?: number;
	styleWhilePremounted?: CSSProperties;
	styleWhilePostmounted?: CSSProperties;
	freeze?: number | null;
	hidden?: boolean;
	name?: string;
	showInTimeline?: boolean;
}

/** Readiness options of the media components. */
export interface DelayRenderProps {
	/** Timeout of the readiness handles the component holds while loading. */
	delayRenderTimeoutInMilliseconds?: number;
	/** Retries of those handles: the frame is retried on a fresh page after a timeout. */
	delayRenderRetries?: number;
}

/** The `delayRender()` options for the readiness props. */
export function delayOptions(props: DelayRenderProps): {
	timeoutInMilliseconds?: number;
	retries?: number;
} {
	const out: { timeoutInMilliseconds?: number; retries?: number } = {};
	if (props.delayRenderTimeoutInMilliseconds !== undefined)
		out.timeoutInMilliseconds = props.delayRenderTimeoutInMilliseconds;
	if (props.delayRenderRetries !== undefined) out.retries = props.delayRenderRetries;
	return out;
}

/** Props of `MediaTimeline`. */
export interface MediaTimelineProps extends MediaSequenceProps, DelayRenderProps {
	src: string;
	trim: ResolvedTrim;
	playbackRate: number;
	loop: boolean;
	isRendering: boolean;
	componentName: string;
	/** Renders the media; `looping` tells whether this timeline loops the source itself. */
	children: (looping: boolean) => ReactNode;
}

/**
 * Places a media component on the timeline: a `Sequence` without layout whose child frame is the
 * position in the source, in composition frames (`trimBefore + elapsed * playbackRate`, wrapped
 * by the loop). A looping media without a finite range waits for the duration of its source:
 * from the renderer's media service during a render (holding a readiness handle), from the
 * element's metadata in a preview.
 */
export function MediaTimeline(props: MediaTimelineProps): ReactNode {
	const { src, trim, playbackRate, loop, isRendering, componentName, children } = props;
	const { fps } = useVideoConfig();
	const known = useKnownDuration(src);
	const needsDuration = loop && !Number.isFinite(trim.durationInFrames);
	const waitForDuration = needsDuration && known === null && isRendering;

	// The readiness options only matter when the handle is created.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useLayoutEffect(() => {
		if (!waitForDuration) return;
		const handle = delayRender(
			`Reading the duration of ${src} to loop <${componentName}>`,
			delayOptions(props),
		);
		let active = true;
		mediaInfo(src).then(
			(info) => {
				if (!active) return;
				if (info.durationInSeconds === null) {
					cancelRender(
						new Error(
							`<${componentName}> has "loop" but the duration of ${src} cannot be determined. Pass "durationInFrames" to set the loop range.`,
						),
					);
				}
				reportDuration(src, info.durationInSeconds as number);
				continueRender(handle);
			},
			(err: unknown) => {
				if (active) cancelRender(err);
			},
		);
		return () => {
			active = false;
			continueRender(handle);
		};
	}, [waitForDuration, src, componentName]);

	const timing: SequenceTimingProps = { trimBefore: trim.trimBefore, playbackRate };
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
	] as const) {
		if (props[key] !== undefined) (timing as Record<string, unknown>)[key] = props[key];
	}
	const length = loop ? loopLength(trim, known, fps) : null;
	if (length !== null) {
		timing.durationInFrames = length;
		timing.loop = true;
	} else if (Number.isFinite(trim.durationInFrames)) {
		timing.durationInFrames = trim.durationInFrames;
	}
	if (waitForDuration) return null;
	return (
		<SequenceBase {...timing} layout="none" componentName={componentName}>
			{children(length !== null)}
		</SequenceBase>
	);
}
