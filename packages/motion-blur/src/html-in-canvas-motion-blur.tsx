import {
	AbsoluteFill,
	continueRender,
	delayRender,
	getRemotionEnvironment,
	Sequence,
	type SequenceProps,
	useCurrentFrame,
	useVideoConfig,
} from "@motiojs/core";
import { HoldFrame, useTimeline } from "@motiojs/core/internals";
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { checkNumber } from "./validate.js";

/** Props of `<HtmlInCanvasMotionBlur>`. */
export interface HtmlInCanvasMotionBlurProps
	extends Pick<
		SequenceProps,
		| "from"
		| "durationInFrames"
		| "trimBefore"
		| "playbackRate"
		| "loop"
		| "freeze"
		| "hidden"
		| "name"
		| "showInTimeline"
		| "premountFor"
		| "postmountFor"
		| "styleWhilePremounted"
		| "styleWhilePostmounted"
	> {
	/** The content to blur. Call `useCurrentFrame()` in a child component. */
	children?: ReactNode;
	/** Width of the canvas in pixels, a positive integer. */
	width: number;
	/** Height of the canvas in pixels, a positive integer. */
	height: number;
	/** CSS applied to the output canvas. */
	style?: CSSProperties;
	/** Snapshots averaged per frame, 1 to 64. Default 8. */
	samples?: number;
	/** Turns the blur off: one snapshot at the current frame. Default false. */
	disabled?: boolean;
	/** Turns the blur off while previewing in the Player. Default false. */
	disabledInPreview?: boolean;
	/** Exposure as an angle of one frame, 0 to 360, centered on the current frame. Default 180. */
	shutterAngle?: number;
}

// Chrome's HTML-in-canvas API (D-057), which the DOM typings do not declare yet.
interface DrawableCanvas extends HTMLCanvasElement {
	requestPaint(): void;
	onpaint: ((event: Event) => void) | null;
}
interface DrawableContext2D extends CanvasRenderingContext2D {
	drawElementImage(element: Element, x: number, y: number): unknown;
}

function isHtmlInCanvasAvailable(): boolean {
	return (
		typeof HTMLCanvasElement !== "undefined" &&
		typeof (HTMLCanvasElement.prototype as Partial<DrawableCanvas>).requestPaint === "function" &&
		typeof CanvasRenderingContext2D !== "undefined" &&
		typeof (CanvasRenderingContext2D.prototype as Partial<DrawableContext2D>).drawElementImage ===
			"function"
	);
}

function checkSize(name: string, value: unknown): asserts value is number {
	checkNumber(name, value);
	if (!Number.isInteger(value) || value <= 0) {
		throw new TypeError(`${name} is ${value}: pass a positive whole number of pixels.`);
	}
}

/**
 * Child frames of the samples at `frame`: `samples` moments spread evenly over the exposure
 * (`shutterAngle / 360` of a parent frame, scaled by the playback `rate`), centered on `frame`,
 * kept within `[first, last]`. Measured on Remotion's renders: sample `i` of `n` is at
 * `frame + exposure * ((i + 0.5) / n - 0.5)`.
 */
export function motionBlurSampleFrames(
	frame: number,
	samples: number,
	shutterAngle: number,
	rate: number,
	first: number,
	last: number,
): number[] {
	const exposure = shutterAngle / 360;
	const frames: number[] = [];
	for (let i = 0; i < samples; i++) {
		const sample = frame + exposure * ((i + 0.5) / samples - 0.5) * rate;
		frames.push(Math.min(Math.max(sample, first), last));
	}
	return frames;
}

// Chrome's 16-bit float canvas pixels (not in the DOM typings yet).
const FLOAT16 = { colorType: "float16" } as CanvasRenderingContext2DSettings;

const DELAY_LABEL = "Drawing the samples of <HtmlInCanvasMotionBlur>";

/** The per-instance state that outlives renders: the readiness handle and the canvases. */
class BlurDrawer {
	hidden: DrawableCanvas | null = null;
	output: HTMLCanvasElement | null = null;
	elements: HTMLElement[] = [];
	#handle: number | null = null;

	commit(elements: HTMLElement[]): void {
		this.elements = elements;
		const hidden = this.hidden;
		if (!hidden) return;
		// A canvas that is not rendered (display: none) gets no paint event and shows nothing.
		if (hidden.getClientRects().length > 0 && this.#handle === null) {
			this.#handle = delayRender(DELAY_LABEL);
		}
		hidden.requestPaint();
	}

	/**
	 * The `paint` event: the snapshots are added with `lighter` at `1 / n` opacity each. Both canvases
	 * use 16-bit float pixels, so the average is not rounded to 8 bits per snapshot (an 8-bit canvas
	 * turns a dark grey 3 into 0 over 8 samples; Remotion's renders keep it).
	 */
	paint(): void {
		const { hidden, output, elements } = this;
		if (!hidden || !output) return;
		const context = hidden.getContext("2d", FLOAT16) as DrawableContext2D | null;
		const target = output.getContext("2d", FLOAT16);
		if (!context || !target) {
			throw new Error("<HtmlInCanvasMotionBlur>: could not get a 2D context for its canvases.");
		}
		context.setTransform(1, 0, 0, 1, 0, 0);
		context.globalAlpha = 1;
		context.globalCompositeOperation = "source-over";
		context.clearRect(0, 0, hidden.width, hidden.height);
		context.globalCompositeOperation = "lighter";
		context.globalAlpha = 1 / Math.max(1, elements.length);
		for (const element of elements) context.drawElementImage(element, 0, 0);
		context.globalAlpha = 1;
		context.globalCompositeOperation = "source-over";
		target.clearRect(0, 0, output.width, output.height);
		target.drawImage(hidden, 0, 0);
		this.#release();
	}

	dispose(): void {
		this.#release();
	}

	#release(): void {
		if (this.#handle === null) return;
		const handle = this.#handle;
		this.#handle = null;
		continueRender(handle);
	}
}

const ATTRIBUTES_CANVAS = { content: "drawable" } as Record<string, string>;
const ATTRIBUTES_DRAWABLE = { drawable: "" } as Record<string, string>;

let warnedUnavailable = false;

function Blurred(props: {
	children?: ReactNode;
	width: number;
	height: number;
	style: CSSProperties | undefined;
	samples: number;
	shutterAngle: number;
	first: number;
	last: number;
}): ReactNode {
	const { children, width, height, samples, shutterAngle, first, last } = props;
	const frame = useCurrentFrame();
	const timeline = useTimeline("<HtmlInCanvasMotionBlur>");
	const [drawer] = useState(() => new BlurDrawer());
	const hidden = useRef<HTMLCanvasElement | null>(null);
	const output = useRef<HTMLCanvasElement | null>(null);
	const current = useRef<HTMLDivElement | null>(null);
	const copies = useRef<Array<HTMLDivElement | null>>([]);
	const blurred = samples > 1 && shutterAngle > 0;
	const frames = blurred
		? motionBlurSampleFrames(
				frame,
				samples,
				shutterAngle,
				timeline.frozen ? 0 : timeline.rate,
				first,
				Math.max(first, last),
			)
		: [];

	useLayoutEffect(() => {
		const canvas = hidden.current as DrawableCanvas | null;
		drawer.hidden = canvas;
		drawer.output = output.current;
		if (canvas) canvas.onpaint = () => drawer.paint();
		return () => {
			if (canvas) canvas.onpaint = null;
			drawer.dispose();
		};
	}, [drawer]);

	useLayoutEffect(() => {
		const elements = blurred
			? copies.current.slice(0, frames.length).filter((e): e is HTMLDivElement => e !== null)
			: current.current
				? [current.current]
				: [];
		drawer.commit(elements);
	});

	const box: CSSProperties = { width: `${width}px`, height: `${height}px` };
	const layer = (interactive: boolean): CSSProperties => ({
		position: "absolute",
		inset: 0,
		...box,
		isolation: "isolate",
		visibility: "visible",
		pointerEvents: interactive ? "auto" : "none",
	});
	return (
		<>
			<canvas
				ref={hidden}
				{...ATTRIBUTES_CANVAS}
				width={width}
				height={height}
				style={{ ...box, position: "absolute", visibility: "hidden", pointerEvents: "none" }}
			>
				<div ref={current} {...ATTRIBUTES_DRAWABLE} style={{ ...box, visibility: "visible" }}>
					<div aria-hidden="false" style={layer(true)}>
						{children}
					</div>
				</div>
				{frames.map((sampleFrame, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: the samples are positions, stable across frames.
						key={i}
						ref={(element) => {
							copies.current[i] = element;
						}}
						aria-hidden="true"
						{...ATTRIBUTES_DRAWABLE}
						style={layer(false)}
					>
						<HoldFrame frame={sampleFrame}>{children}</HoldFrame>
					</div>
				))}
			</canvas>
			<canvas ref={output} width={width} height={height} style={{ ...box, ...props.style }} />
		</>
	);
}

/**
 * Motion blur on any content, drawn through Chrome's HTML-in-canvas API: the children are laid
 * out `samples` times inside a canvas, at moments spread over the exposure and centered on the
 * current frame, and the snapshots are averaged onto a `width` by `height` canvas. Accepts the
 * timing props of `<Sequence>`. Without the HTML-in-canvas API the children are shown unblurred.
 */
export function HtmlInCanvasMotionBlur(props: HtmlInCanvasMotionBlurProps): ReactNode {
	const {
		children,
		width,
		height,
		style,
		samples = 8,
		disabled = false,
		disabledInPreview = false,
		shutterAngle = 180,
		...sequence
	} = props;
	checkSize("width", width);
	checkSize("height", height);
	checkNumber("samples", samples);
	if (!Number.isInteger(samples) || samples < 1 || samples > 64) {
		throw new TypeError(`samples is ${samples}: pass a whole number from 1 to 64.`);
	}
	checkNumber("shutterAngle", shutterAngle);
	if (shutterAngle < 0 || shutterAngle > 360) {
		throw new TypeError(`shutterAngle is ${shutterAngle}: use an angle from 0 to 360 degrees.`);
	}
	const [available] = useState(isHtmlInCanvasAvailable);
	// The first and last child frames the sequence shows: samples are kept between them (measured).
	const parentEnd = useVideoConfig().durationInFrames;
	const from = sequence.from ?? 0;
	const rate = sequence.playbackRate ?? 1;
	const first = sequence.trimBefore ?? 0;
	const shown =
		sequence.durationInFrames !== undefined && Number.isFinite(sequence.durationInFrames)
			? Math.min(Math.ceil(sequence.durationInFrames / rate), parentEnd - from)
			: parentEnd - from;
	const last = first + (shown - 1) * rate;
	const off = disabled || (disabledInPreview && !getRemotionEnvironment().isRendering);
	if (!available && !warnedUnavailable) {
		warnedUnavailable = true;
		console.warn(
			"<HtmlInCanvasMotionBlur>: this browser has no HTML-in-canvas API (Chrome 157 or later has it); the content is shown without motion blur.",
		);
	}
	return (
		<AbsoluteFill>
			<Sequence layout="none" {...sequence}>
				{available ? (
					<Blurred
						width={width}
						height={height}
						style={style}
						samples={off ? 1 : samples}
						shutterAngle={shutterAngle}
						first={first}
						last={last}
					>
						{children}
					</Blurred>
				) : (
					children
				)}
			</Sequence>
		</AbsoluteFill>
	);
}
