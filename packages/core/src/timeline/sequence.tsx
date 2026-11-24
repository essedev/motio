import {
	type CSSProperties,
	forwardRef,
	type HTMLAttributes,
	type ReactNode,
	useContext,
	useId,
	useLayoutEffect,
	useRef,
} from "react";
import { useRemotionEnvironment } from "../environment.js";
import { SEQUENCE_FROM_ATTRIBUTE } from "../protocol.js";
import { absoluteFillStyle } from "./absolute-fill-style.js";
import { LoopContext, type LoopInfo, TimelineContext, type TimelineState } from "./contexts.js";
import { clampFrozenFrame, warnClampedFreeze } from "./freeze-range.js";
import { useTimeline } from "./hooks.js";
import {
	SequenceParentContext,
	SequenceRegistryContext,
	sequencePlacement,
} from "./sequence-registry.js";

/** Attribute next to `data-motio-from` with the cumulative playback rate, when not 1. */
export const SEQUENCE_RATE_ATTRIBUTE = "data-motio-rate";

/** Timing props shared by `Sequence`, `AbsoluteFill`, `Loop` and the media components. */
export interface SequenceTimingProps {
	/** Parent frame at which the children are at their first frame. Default 0. */
	from?: number;
	/** Frames of the child timeline to show, counted from `trimBefore`. Default `Infinity`. */
	durationInFrames?: number;
	/** First frame of the child timeline. Default 0. */
	trimBefore?: number;
	/** Speed of the children: 2 is double speed. Positive, finite, constant. Default 1. */
	playbackRate?: number;
	/** Repeat the selected range until the parent ends; needs a finite `durationInFrames`. */
	loop?: boolean;
	/** Freeze the children at this frame. */
	freeze?: number | null;
	/** Do not render the sequence or its children. */
	hidden?: boolean;
	/** Label in the timeline of an editor. No effect on rendering. */
	name?: string;
	/** Whether an editor timeline shows this sequence. No effect on rendering. */
	showInTimeline?: boolean;
	/** Mount this many frames early, hidden and held at the first frame (Player only). */
	premountFor?: number;
	/** Stay mounted this many frames after the end, hidden and held at the last frame. */
	postmountFor?: number;
	/** Styles applied to the container while premounted, over the defaults. */
	styleWhilePremounted?: CSSProperties;
	/** Styles applied to the container while postmounted, over the defaults. */
	styleWhilePostmounted?: CSSProperties;
}

/** Props of `<Sequence>`. */
export interface SequenceProps extends SequenceTimingProps {
	children?: ReactNode;
	/** `"absolute-fill"` (default) wraps the children in an `AbsoluteFill`; `"none"` does not. */
	layout?: "absolute-fill" | "none";
	/** Styles of the container. Not allowed with `layout="none"`. */
	style?: CSSProperties;
	/** Class of the container. Not allowed with `layout="none"`. */
	className?: string;
	/** Width of the container; also overrides `useVideoConfig().width` in the children. */
	width?: number;
	/** Height of the container; also overrides `useVideoConfig().height` in the children. */
	height?: number;
	/** Crop ratios between 0 and 1, applied with a clip path. `layout="absolute-fill"` only. */
	cropLeft?: number;
	cropRight?: number;
	cropTop?: number;
	cropBottom?: number;
	/** Deprecated: has no effect. */
	outlineRef?: unknown;
}

/** Where a sequence stands relative to the parent frame. */
export type SequencePhase = "before" | "premount" | "active" | "postmount" | "after";

/** The result of `computeSequence()`. */
export interface SequenceComputation {
	phase: SequencePhase;
	/** Timeline state for the children; null when nothing is rendered. */
	child: TimelineState | null;
	/** Loop information for a looping sequence. */
	loop: LoopInfo | null;
}

function isNumber(v: unknown): v is number {
	return typeof v === "number" && !Number.isNaN(v);
}

function fail(component: string, message: string, type: ErrorConstructor = Error): never {
	throw new type(`<${component}>: ${message}`);
}

/** Throws a descriptive error for invalid timing props. */
export function validateTimingProps(props: SequenceTimingProps, component = "Sequence"): void {
	const {
		from,
		durationInFrames,
		trimBefore,
		playbackRate,
		loop,
		freeze,
		premountFor,
		postmountFor,
	} = props;
	if (from !== undefined && (!isNumber(from) || !Number.isFinite(from))) {
		fail(component, `"from" must be a finite number, got ${String(from)}.`);
	}
	if (durationInFrames !== undefined) {
		if (!isNumber(durationInFrames)) {
			fail(component, `"durationInFrames" must be a number, got ${String(durationInFrames)}.`);
		}
		if (durationInFrames <= 0) {
			fail(component, `"durationInFrames" must be positive, got ${durationInFrames}.`);
		}
	}
	if (
		trimBefore !== undefined &&
		(!isNumber(trimBefore) || !Number.isFinite(trimBefore) || trimBefore < 0)
	) {
		fail(
			component,
			`"trimBefore" must be a non-negative finite number, got ${String(trimBefore)}.`,
		);
	}
	if (
		playbackRate !== undefined &&
		(!isNumber(playbackRate) || !Number.isFinite(playbackRate) || playbackRate <= 0)
	) {
		// A TypeError, as the published package throws (recorded by @remotion/gif and @remotion/rive).
		fail(
			component,
			`"playbackRate" must be a positive finite number, got ${String(playbackRate)}.`,
			TypeError,
		);
	}
	if (loop && !Number.isFinite(durationInFrames ?? Number.POSITIVE_INFINITY)) {
		fail(
			component,
			'"loop" needs a finite "durationInFrames". Wrap it in an outer <Sequence> to limit the total duration.',
		);
	}
	if (freeze !== undefined && freeze !== null && (!isNumber(freeze) || !Number.isFinite(freeze))) {
		fail(component, `"freeze" must be a finite number or null, got ${String(freeze)}.`);
	}
	for (const [key, value] of [
		["premountFor", premountFor],
		["postmountFor", postmountFor],
	] as const) {
		if (value !== undefined && (!isNumber(value) || !Number.isFinite(value) || value < 0)) {
			fail(component, `"${key}" must be a non-negative finite number, got ${String(value)}.`);
		}
	}
}

/**
 * Derives the children's timeline from the parent's for the given timing props. Pure: the same
 * parent state and props give the same result.
 */
export function computeSequence(
	parent: TimelineState,
	props: SequenceTimingProps,
	allowPremount: boolean,
): SequenceComputation {
	const from = props.from ?? 0;
	const duration = props.durationInFrames ?? Number.POSITIVE_INFINITY;
	const trim = props.trimBefore ?? 0;
	const rate = props.playbackRate ?? 1;
	const loop = props.loop === true;
	const premountFor = allowPremount ? (props.premountFor ?? 0) : 0;
	const postmountFor = allowPremount ? (props.postmountFor ?? 0) : 0;
	const f = parent.frame;
	const parentEnd = parent.durationInFrames;
	const end = loop ? parentEnd : Math.min(from + duration / rate, parentEnd);

	let phase: SequencePhase;
	if (props.hidden) phase = "before";
	else if (f < from) phase = f >= from - premountFor ? "premount" : "before";
	else if (f >= end) phase = f < end + postmountFor ? "postmount" : "after";
	else phase = "active";
	if (phase === "before" || phase === "after") return { phase, child: null, loop: null };

	const localEnd = loop ? trim + duration : trim + (end - from) * rate;
	let frame: number;
	let loopInfo: LoopInfo | null = null;
	let start = from;
	if (phase === "premount") {
		frame = trim;
	} else if (phase === "postmount") {
		frame = Math.max(trim, localEnd - 1);
	} else {
		const elapsed = (f - from) * rate;
		if (loop) {
			const iteration = Math.floor(elapsed / duration);
			frame = trim + (elapsed - iteration * duration);
			loopInfo = { durationInFrames: duration, iteration };
			start = from + (iteration * duration) / rate;
		} else {
			frame = trim + elapsed;
		}
	}

	const mapRate = parent.mapRate * rate;
	const mapOffset = trim + (parent.mapOffset - start) * rate;
	const frozenByProp = props.freeze !== undefined && props.freeze !== null;
	if (frozenByProp) {
		frame = clampFrozenFrame(
			{ compositionDurationInFrames: parent.compositionDurationInFrames, mapOffset, mapRate },
			props.freeze as number,
		);
	}
	const absoluteStart =
		parent.rate > 0 ? parent.absoluteFrame + (start - f) / parent.rate : parent.absoluteStart;
	const held = phase !== "active" || frozenByProp || parent.frozen;

	return {
		phase,
		loop: loopInfo,
		child: {
			frame,
			durationInFrames: localEnd,
			width: parent.width,
			height: parent.height,
			absoluteFrame: parent.absoluteFrame,
			absoluteStart,
			rate: held ? 0 : parent.rate * rate,
			frozen: parent.frozen || frozenByProp,
			premounted: phase === "premount",
			postmounted: phase === "postmount",
			compositionDurationInFrames: parent.compositionDurationInFrames,
			mapOffset,
			mapRate,
		},
	};
}

const HIDDEN_WHILE_MOUNTED: CSSProperties = { display: "none", pointerEvents: "none" };

function cssLength(v: string | number | undefined): string | null {
	if (v === undefined) return null;
	return typeof v === "number" ? `${v}px` : v;
}

/** Clip path for the crop props, rounded like the inline border radius. */
export function cropClipPath(
	crop: { left: number; right: number; top: number; bottom: number },
	style: CSSProperties | undefined,
): string | null {
	let { left, right, top, bottom } = crop;
	if (left === 0 && right === 0 && top === 0 && bottom === 0) return null;
	// As Remotion writes it (the same rule Interactive matches from the oracle, D-036):
	// overlapping opposite crops both become 50%, and percentages are not rounded.
	if (left + right > 1) {
		left = 0.5;
		right = 0.5;
	}
	if (top + bottom > 1) {
		top = 0.5;
		bottom = 0.5;
	}
	const pct = (n: number) => `${n * 100}%`;
	let clip = `inset(${pct(top)} ${pct(right)} ${pct(bottom)} ${pct(left)}`;
	const all = cssLength(style?.borderRadius as string | number | undefined);
	const corners = [
		cssLength(style?.borderTopLeftRadius as string | number | undefined) ?? all,
		cssLength(style?.borderTopRightRadius as string | number | undefined) ?? all,
		cssLength(style?.borderBottomRightRadius as string | number | undefined) ?? all,
		cssLength(style?.borderBottomLeftRadius as string | number | undefined) ?? all,
	];
	if (corners.every((c) => c === all)) {
		if (all !== null) clip += ` round ${all}`;
	} else {
		clip += ` round ${corners.map((c) => c ?? "0").join(" ")}`;
	}
	return `${clip})`;
}

/** Internal props: `AbsoluteFill` forwards its div attributes to the container. */
export interface SequenceInternalProps extends SequenceProps {
	containerProps?: HTMLAttributes<HTMLDivElement>;
	/** Component name used in error messages. */
	componentName?: string;
	/**
	 * For `<Loop>`, which renders one iteration at a time: the whole loop, for the editor
	 * timeline. `durationInFrames` is one iteration in parent frames.
	 */
	timelineLoop?: { durationInFrames: number; times: number };
}

/** The implementation behind `Sequence`, `Series.Sequence`, `Loop` and timed `AbsoluteFill`. */
export const SequenceBase = forwardRef<HTMLDivElement, SequenceInternalProps>(
	function SequenceBase(props, ref) {
		const {
			children,
			layout = "absolute-fill",
			style,
			className,
			width,
			height,
			cropLeft = 0,
			cropRight = 0,
			cropTop = 0,
			cropBottom = 0,
			styleWhilePremounted,
			styleWhilePostmounted,
			containerProps,
			componentName = "Sequence",
		} = props;
		const parent = useTimeline(`<${componentName}>`);
		const env = useRemotionEnvironment();
		const firstRate = useRef(props.playbackRate ?? 1);

		validateTimingProps(props, componentName);
		if (layout !== "absolute-fill" && layout !== "none") {
			fail(componentName, `"layout" must be "absolute-fill" or "none", got ${String(layout)}.`);
		}
		if (layout === "none") {
			if (style !== undefined) fail(componentName, 'a "style" is not allowed with layout="none".');
			if (className !== undefined) {
				fail(componentName, 'a "className" is not allowed with layout="none".');
			}
			if (cropLeft || cropRight || cropTop || cropBottom) {
				fail(componentName, 'the crop props need layout="absolute-fill".');
			}
		}
		for (const [key, value] of [
			["cropLeft", cropLeft],
			["cropRight", cropRight],
			["cropTop", cropTop],
			["cropBottom", cropBottom],
		] as const) {
			if (!isNumber(value) || value < 0 || value > 1) {
				fail(componentName, `"${key}" must be a number between 0 and 1, got ${String(value)}.`);
			}
		}
		for (const [key, value] of [
			["width", width],
			["height", height],
		] as const) {
			if (value !== undefined && (!isNumber(value) || !Number.isFinite(value) || value <= 0)) {
				fail(componentName, `"${key}" must be a positive number, got ${String(value)}.`);
			}
		}
		if ((props.playbackRate ?? 1) !== firstRate.current) {
			fail(
				componentName,
				`"playbackRate" must stay constant across frames (was ${firstRate.current}, now ${props.playbackRate ?? 1}).`,
			);
		}

		const { phase, child, loop } = computeSequence(parent, props, !env.isRendering);

		// The editor timeline (motio dev): register even when outside the range, so the timeline
		// shows every sequence of the current tree, not only the visible ones.
		const registry = useContext(SequenceRegistryContext);
		const parentId = useContext(SequenceParentContext);
		const id = useId();
		const listed = registry !== null && props.showInTimeline !== false;
		const timelineLoop = props.timelineLoop;
		const placement = !listed
			? null
			: timelineLoop
				? sequencePlacement(parent, {
						from: 0,
						durationInFrames: timelineLoop.durationInFrames * timelineLoop.times,
					})
				: sequencePlacement(parent, props);
		if (placement && timelineLoop) {
			placement.loopDurationInFrames = timelineLoop.durationInFrames / parent.mapRate;
		}
		const name = props.name ?? null;
		const hidden = props.hidden === true;
		useLayoutEffect(() => {
			if (!registry || !listed) return;
			return () => registry.remove(id);
		}, [registry, listed, id]);
		useLayoutEffect(() => {
			if (!registry || !placement) return;
			registry.set({ id, parentId, name, componentName, hidden, ...placement });
		});
		const withParent = (node: ReactNode) =>
			listed ? (
				<SequenceParentContext.Provider value={id}>{node}</SequenceParentContext.Provider>
			) : (
				node
			);

		if (!child) return null;
		if (props.freeze !== undefined && props.freeze !== null && child.frame !== props.freeze) {
			warnClampedFreeze(`<${componentName}> "freeze"`, props.freeze, child);
		}
		const childState: TimelineState = {
			...child,
			width: width ?? parent.width,
			height: height ?? parent.height,
		};

		let content: ReactNode = (
			<TimelineContext.Provider value={childState}>{children}</TimelineContext.Provider>
		);
		if (loop) content = <LoopContext.Provider value={loop}>{content}</LoopContext.Provider>;
		content = withParent(content);
		if (layout === "none") return content;

		// Remotion's Sequence container is an absolute fill without `flex-direction: column`
		// (recorded markup of <Sequence>, <Series.Sequence> and <Loop>): children flow in a row.
		const { flexDirection: _column, ...fill } = absoluteFillStyle(className);
		const merged: CSSProperties = {
			...fill,
			...(width !== undefined ? { width } : null),
			...(height !== undefined ? { height } : null),
			...style,
		};
		const clip = cropClipPath(
			{ left: cropLeft, right: cropRight, top: cropTop, bottom: cropBottom },
			style,
		);
		if (clip) merged.clipPath = clip;
		const finalStyle: CSSProperties =
			phase === "premount"
				? { ...merged, ...HIDDEN_WHILE_MOUNTED, ...styleWhilePremounted }
				: phase === "postmount"
					? { ...merged, ...HIDDEN_WHILE_MOUNTED, ...styleWhilePostmounted }
					: merged;
		const attributes: Record<string, string> = {
			[SEQUENCE_FROM_ATTRIBUTE]: String(childState.absoluteStart),
		};
		if (childState.rate !== 1) attributes[SEQUENCE_RATE_ATTRIBUTE] = String(childState.rate);

		return (
			<div {...containerProps} {...attributes} ref={ref} className={className} style={finalStyle}>
				{content}
			</div>
		);
	},
);

/**
 * Places its children on the timeline: they start at `from`, last `durationInFrames`, and see
 * `useCurrentFrame()` shifted accordingly. Wraps them in an `AbsoluteFill` unless
 * `layout="none"`.
 */
export const Sequence = forwardRef<HTMLDivElement, SequenceProps>(function Sequence(props, ref) {
	return <SequenceBase {...props} ref={ref} />;
});
