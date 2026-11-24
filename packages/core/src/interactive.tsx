import {
	type ComponentPropsWithRef,
	type ComponentType,
	type CSSProperties,
	createElement,
	type ForwardRefExoticComponent,
	forwardRef,
	type JSX,
	type ReactNode,
	type RefAttributes,
} from "react";
import { useRemotionEnvironment } from "./environment.js";
import {
	backgroundSchema,
	baseSchema,
	borderRadiusSchema,
	borderSchema,
	captionsSchema,
	childrenSchema,
	cropSchema,
	type InteractivitySchema,
	premountSchema,
	sequenceSchema,
	svgPaintSchema,
	svgStrokeSchema,
	textSchema,
	transformSchema,
} from "./interactive-schema.js";
import {
	LoopContext,
	type LoopInfo,
	TimelineContext,
	type TimelineState,
} from "./timeline/contexts.js";
import { warnClampedFreeze } from "./timeline/freeze-range.js";
import { useTimeline } from "./timeline/hooks.js";
import {
	computeSequence,
	type SequencePhase,
	type SequenceTimingProps,
	validateTimingProps,
} from "./timeline/sequence.js";

export type { InteractivitySchema, InteractivitySchemaField } from "./interactive-schema.js";

/** Timing props every interactive element and component accepts, as on `<Sequence>`. */
export type InteractiveBaseProps = {
	/** Frames to show, counted from `trimBefore`. Default: until the parent ends. */
	durationInFrames?: number | undefined;
	/** Parent frame at which the element appears. Default 0. */
	from?: number | undefined;
	/** First frame of the children's timeline. Default 0. */
	trimBefore?: number | undefined;
	/** Speed of the children's timeline. Default 1. */
	playbackRate?: number | undefined;
	/** Freezes the children at this frame. */
	freeze?: number | null | undefined;
	/** Does not render the element or its children. */
	hidden?: boolean | undefined;
	/** Label in the Studio's timeline. No effect on rendering. */
	name?: string | undefined;
	/** Whether the Studio's timeline shows the element. No effect on rendering. */
	showInTimeline?: boolean | undefined;
	/** Repeats the selected range; needs a finite `durationInFrames`. */
	loop?: boolean | undefined;
};

/** Premount props of interactive elements and components (Player and Studio only). */
export type InteractivePremountProps = {
	/** Mounts this many frames early, invisible. */
	premountFor?: number | undefined;
	/** Stays mounted this many frames after the end, invisible. */
	postmountFor?: number | undefined;
	/** Styles while premounted, over `opacity: 0; pointer-events: none`. */
	styleWhilePremounted?: CSSProperties | undefined;
	/** Styles while postmounted, over `opacity: 0; pointer-events: none`. */
	styleWhilePostmounted?: CSSProperties | undefined;
};

/** Crop ratios between 0 and 1, applied as a `clip-path: inset(...)`. */
export type InteractiveCropProps = {
	cropLeft?: number | undefined;
	cropRight?: number | undefined;
	cropTop?: number | undefined;
	cropBottom?: number | undefined;
};

/** The style properties `transformSchema` edits. */
export type InteractiveTransformProps = {
	style?: Pick<CSSProperties, "transformOrigin" | "translate" | "scale" | "rotate" | "opacity">;
};

/** Props an interactive component or element adds to the ones of what it wraps. */
export type InteractiveProps = InteractiveBaseProps &
	InteractivePremountProps &
	InteractiveCropProps;

/** Props of `Interactive.Div`, `Interactive.Svg`, ...: the element's own props plus the timing props. */
export type InteractiveElementProps<Tag extends keyof JSX.IntrinsicElements> = Omit<
	ComponentPropsWithRef<Tag>,
	keyof InteractiveProps
> &
	InteractiveProps;

/** An element of `Interactive`. */
export type InteractiveElement<Tag extends keyof JSX.IntrinsicElements> = ForwardRefExoticComponent<
	InteractiveElementProps<Tag>
>;

const TIMING_KEYS = [
	"from",
	"durationInFrames",
	"trimBefore",
	"playbackRate",
	"loop",
	"freeze",
	"hidden",
	"name",
	"showInTimeline",
	"premountFor",
	"postmountFor",
	"styleWhilePremounted",
	"styleWhilePostmounted",
	"cropLeft",
	"cropRight",
	"cropTop",
	"cropBottom",
] as const;

type Split = {
	timing: SequenceTimingProps & InteractiveCropProps;
	style: CSSProperties | undefined;
	/** Everything else, in the order given. */
	rest: Record<string, unknown>;
};

const splitProps = (props: Record<string, unknown>): Split => {
	const timing: Record<string, unknown> = {};
	const rest: Record<string, unknown> = {};
	for (const key of Object.keys(props)) {
		if ((TIMING_KEYS as readonly string[]).includes(key)) timing[key] = props[key];
		else if (key !== "style") rest[key] = props[key];
	}
	return {
		timing: timing as Split["timing"],
		style: props.style as CSSProperties | undefined,
		rest,
	};
};

/** `n` as a CSS percentage, written like Remotion (no rounding). */
const percent = (n: number) => `${n * 100}%`;

const cssLength = (v: unknown): string | null => {
	if (v === undefined || v === null) return null;
	return typeof v === "number" ? `${v}px` : String(v);
};

/**
 * The clip path of the crop props: `inset(top right bottom left)`, rounded like
 * the border radius in `style`. Opposite crops that overlap meet in the middle.
 */
const cropClipPath = (
	crop: InteractiveCropProps,
	style: CSSProperties | undefined,
): string | null => {
	let left = crop.cropLeft ?? 0;
	let right = crop.cropRight ?? 0;
	let top = crop.cropTop ?? 0;
	let bottom = crop.cropBottom ?? 0;
	for (const [key, value] of Object.entries({ left, right, top, bottom })) {
		if (!(typeof value === "number" && value >= 0 && value <= 1)) {
			const name = `crop${key[0]?.toUpperCase()}${key.slice(1)}`;
			throw new Error(`"${name}" must be a number between 0 and 1, got ${String(value)}.`);
		}
	}
	if (left === 0 && right === 0 && top === 0 && bottom === 0) return null;
	if (left + right > 1) {
		left = 0.5;
		right = 0.5;
	}
	if (top + bottom > 1) {
		top = 0.5;
		bottom = 0.5;
	}
	let clip = `inset(${percent(top)} ${percent(right)} ${percent(bottom)} ${percent(left)}`;
	const all = cssLength(style?.borderRadius);
	const corners = [
		cssLength(style?.borderTopLeftRadius) ?? all,
		cssLength(style?.borderTopRightRadius) ?? all,
		cssLength(style?.borderBottomRightRadius) ?? all,
		cssLength(style?.borderBottomLeftRadius) ?? all,
	];
	if (corners.every((c) => c === all)) {
		if (all !== null) clip += ` round ${all}`;
	} else {
		clip += ` round ${corners.map((c) => c ?? "0").join(" ")}`;
	}
	return `${clip})`;
};

const HIDDEN_WHILE_MOUNTED: CSSProperties = { opacity: 0, pointerEvents: "none" };

/** The element's style: crop as a clip path, hidden while premounted or postmounted. */
const finalStyle = (
	style: CSSProperties | undefined,
	timing: Split["timing"],
	phase: SequencePhase,
): CSSProperties | undefined => {
	const clip = cropClipPath(timing, style);
	const merged = clip === null ? style : { ...style, clipPath: clip };
	if (phase === "premount") {
		return { ...merged, ...HIDDEN_WHILE_MOUNTED, ...timing.styleWhilePremounted };
	}
	if (phase === "postmount") {
		return { ...merged, ...HIDDEN_WHILE_MOUNTED, ...timing.styleWhilePostmounted };
	}
	return merged;
};

type SequenceResult = { phase: SequencePhase; child: TimelineState; loop: LoopInfo | null };

/** The timeline of an interactive element's children, or null when it is not shown. */
const useInteractiveSequence = (
	timing: Split["timing"],
	componentName: string,
): SequenceResult | null => {
	const parent = useTimeline(`<${componentName}>`);
	const env = useRemotionEnvironment();
	validateTimingProps(timing, componentName);
	const { phase, child, loop } = computeSequence(parent, timing, !env.isRendering);
	const freeze = timing.freeze;
	if (child && freeze !== undefined && freeze !== null && child.frame !== freeze) {
		warnClampedFreeze(`<${componentName}> "freeze"`, freeze, child);
	}
	return child === null ? null : { phase, child, loop };
};

const provide = (sequence: SequenceResult, children: ReactNode): ReactNode => {
	const content = (
		<TimelineContext.Provider value={sequence.child}>{children}</TimelineContext.Provider>
	);
	return sequence.loop ? (
		<LoopContext.Provider value={sequence.loop}>{content}</LoopContext.Provider>
	) : (
		content
	);
};

const makeElement = <Tag extends keyof JSX.IntrinsicElements>(
	tag: Tag,
	name: string,
): InteractiveElement<Tag> => {
	const componentName = `Interactive.${name}`;
	// biome-ignore lint/correctness/noComponentHookFactories: runs once per element when the module loads, like a higher-order component
	const Element = forwardRef<unknown, Record<string, unknown>>(
		// biome-ignore lint/correctness/noComponentHookFactories: see above
		function InteractiveElement(props, ref) {
			const { timing, style, rest } = splitProps(props);
			const { children, ...attributes } = rest;
			const sequence = useInteractiveSequence(timing, componentName);
			if (sequence === null) return null;
			return createElement(
				tag,
				{ ...attributes, ref, style: finalStyle(style, timing, sequence.phase) },
				provide(sequence, children as ReactNode),
			);
		},
	);
	Element.displayName = `<${componentName}>`;
	return Element as unknown as InteractiveElement<Tag>;
};

/** The style of the container `Interactive.create({ layout: "absolute-fill" })` renders. */
const ABSOLUTE_FILL: CSSProperties = {
	position: "absolute",
	top: 0,
	left: 0,
	right: 0,
	bottom: 0,
	width: "100%",
	height: "100%",
	display: "flex",
	overflow: "hidden",
};

/** A component wrapped by `Interactive.withSchema()` or `Interactive.create()`. */
export type InteractiveComponent<P> = ForwardRefExoticComponent<
	Omit<P, keyof InteractiveProps | "ref"> & InteractiveProps & RefAttributes<unknown>
>;

const displayNameOf = (Component: ComponentType<never>) =>
	`withInteractivitySchema(${Component.displayName ?? (Component.name || "Component")})`;

const wrapInSequence = <P,>(
	Component: ComponentType<P>,
	layout: "none" | "absolute-fill",
	componentName: string,
): InteractiveComponent<P> => {
	const Wrapped = forwardRef<unknown, Record<string, unknown>>(function Interactive(props, ref) {
		const { timing, style, rest } = splitProps(props);
		const sequence = useInteractiveSequence(timing, componentName);
		if (sequence === null) return null;
		if (layout === "absolute-fill") {
			return (
				<div
					ref={ref as never}
					style={finalStyle({ ...ABSOLUTE_FILL, ...style }, timing, sequence.phase)}
				>
					{provide(
						sequence,
						createElement(Component as ComponentType<Record<string, unknown>>, rest),
					)}
				</div>
			);
		}
		return provide(
			sequence,
			createElement(Component as ComponentType<Record<string, unknown>>, {
				...rest,
				style: finalStyle(style, timing, sequence.phase),
				ref,
			}),
		);
	});
	Wrapped.displayName = displayNameOf(Component as ComponentType<never>);
	return Wrapped as unknown as InteractiveComponent<P>;
};

/** Options of `Interactive.withSchema()`. */
export type WithSchemaOptions<P> = {
	/** The component; with `wrapInSequence` it must apply the `style` it receives to its root. */
	Component: ComponentType<P>;
	/** Name shown in the Studio. No effect on rendering. */
	componentName?: string | undefined;
	/** The props the Studio can edit. No effect on rendering. */
	schema?: InteractivitySchema | undefined;
	/** Wraps the component in a sequence that takes the timing props. Default false. */
	wrapInSequence?: boolean | undefined;
};

/** Options of `Interactive.create()`. */
export type InteractiveCreateOptions<P> = {
	/**
	 * The component. With the default layout it receives `style` (with the crop
	 * as a clip path) and must apply it to its visual root.
	 */
	Component: ComponentType<P>;
	/** Name shown in the Studio. No effect on rendering. */
	componentName?: string | undefined;
	/** The props the Studio can edit. No effect on rendering. */
	schema?: InteractivitySchema | undefined;
	/**
	 * `"none"` (default) renders the component itself; `"absolute-fill"` renders
	 * it in a full-size, absolutely positioned container with `overflow: hidden`
	 * that takes `style` and the crop.
	 */
	layout?: "none" | "absolute-fill" | undefined;
};

/**
 * Deprecated in Remotion in favour of `Interactive.create()`. With
 * `wrapInSequence: true` it is the same as `create()`; otherwise the component
 * receives every prop unchanged (plus `controls: null`) and no sequence is added.
 */
const withSchema = <P,>(options: WithSchemaOptions<P>): InteractiveComponent<P> => {
	const { Component, wrapInSequence: wrap } = options;
	const name = displayNameOf(Component as ComponentType<never>);
	if (wrap) return wrapInSequence(Component, "none", name);
	// biome-ignore lint/correctness/noComponentHookFactories: a higher-order component, called once per wrapped component
	const Passthrough = forwardRef<unknown, Record<string, unknown>>(
		// biome-ignore lint/correctness/noComponentHookFactories: see above
		function Interactive(props, ref) {
			return createElement(Component as ComponentType<Record<string, unknown>>, {
				...props,
				controls: null,
				ref,
			});
		},
	);
	Passthrough.displayName = name;
	return Passthrough as unknown as InteractiveComponent<P>;
};

/**
 * Wraps a component in a sequence that takes the timing, premount and crop
 * props. The Studio's editing controls are not part of Motio: the schema is
 * accepted and ignored.
 */
const create = <P,>(options: InteractiveCreateOptions<P>): InteractiveComponent<P> => {
	const { Component, layout = "none" } = options;
	return wrapInSequence(Component, layout, displayNameOf(Component as ComponentType<never>));
};

/**
 * Elements and components the Remotion Studio can edit visually, compatible
 * with Remotion's `Interactive`. When rendering, `Interactive.Div` and the
 * other elements render the plain element with its props, placed on the
 * timeline like a `<Sequence layout="none">` (`from`, `durationInFrames`, ...),
 * with the crop props as a `clip-path`. `withSchema()` and `create()` wrap a
 * component the same way. Studio editing is out of scope: schemas are data.
 */
export const Interactive = {
	A: makeElement("a", "A"),
	Article: makeElement("article", "Article"),
	Aside: makeElement("aside", "Aside"),
	Button: makeElement("button", "Button"),
	Code: makeElement("code", "Code"),
	Div: makeElement("div", "Div"),
	Em: makeElement("em", "Em"),
	Footer: makeElement("footer", "Footer"),
	H1: makeElement("h1", "H1"),
	H2: makeElement("h2", "H2"),
	H3: makeElement("h3", "H3"),
	H4: makeElement("h4", "H4"),
	H5: makeElement("h5", "H5"),
	H6: makeElement("h6", "H6"),
	Header: makeElement("header", "Header"),
	Label: makeElement("label", "Label"),
	Li: makeElement("li", "Li"),
	Main: makeElement("main", "Main"),
	Nav: makeElement("nav", "Nav"),
	Ol: makeElement("ol", "Ol"),
	P: makeElement("p", "P"),
	Pre: makeElement("pre", "Pre"),
	Section: makeElement("section", "Section"),
	Small: makeElement("small", "Small"),
	Span: makeElement("span", "Span"),
	Strong: makeElement("strong", "Strong"),
	Ul: makeElement("ul", "Ul"),
	Circle: makeElement("circle", "Circle"),
	Ellipse: makeElement("ellipse", "Ellipse"),
	G: makeElement("g", "G"),
	Line: makeElement("line", "Line"),
	Path: makeElement("path", "Path"),
	Rect: makeElement("rect", "Rect"),
	Svg: makeElement("svg", "Svg"),
	Text: makeElement("text", "Text"),
	withSchema,
	create,
	baseSchema,
	premountSchema,
	transformSchema,
	cropSchema,
	textSchema,
	childrenSchema,
	captionsSchema,
	backgroundSchema,
	borderSchema,
	borderRadiusSchema,
	svgPaintSchema,
	svgStrokeSchema,
	sequenceSchema,
};
