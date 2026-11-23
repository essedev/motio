import { continueRender, delayRender } from "@motiojs/core";
import {
	type CSSProperties,
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import {
	makeTextBackground,
	type TextBackgroundAlign,
	type TextBackgroundShape,
} from "./make-text-background.js";
import { MARKER_SPAN, type MeasuredLines, measureLines } from "./measure-lines.js";
import type { TextBackgroundJoin } from "./outline.js";

/** A border drawn along the outline, centred on it. */
export interface TextBackgroundBorder {
	width: number;
	color: string;
}

/** A shadow cast by the whole shape (CSS `drop-shadow()`). */
export interface TextBackgroundShadow {
	/** Default 0. */
	offsetX?: number;
	/** Default 0. */
	offsetY?: number;
	/** Blur radius in pixels. Default 0. */
	blur?: number;
	/** Default `"rgba(0, 0, 0, 0.5)"`. */
	color?: string;
}

/** Props of `<TextBackground>`. */
export interface TextBackgroundProps {
	/** Inline content: text, `<span>`, `<b>`, `<br />`. Block elements are not measured. */
	children?: ReactNode;
	/** Alignment of the lines (sets `text-align`). Default `"left"`. */
	align?: TextBackgroundAlign;
	/** Size of every corner, capped as `makeTextBackground()` caps it. Default 0. */
	cornerRadius?: number;
	/** Space left and right of every line. Default 0. */
	paddingX?: number;
	/** Space above the first line and below the last. Default 0. */
	paddingY?: number;
	/** `"round"` (default), `"bevel"` or `"sharp"` corners. */
	join?: TextBackgroundJoin;
	/** Colour of the shape. Default `"white"`. */
	fill?: string;
	/** Border along the outline. Default none. */
	border?: TextBackgroundBorder;
	/** Shadow of the shape. Default none. */
	shadow?: TextBackgroundShadow;
	/**
	 * Styles of the block (font, colour, `lineHeight`, `maxWidth`, placement). It is an
	 * `inline-block` by default; `padding` and `textAlign` come from the props above.
	 */
	style?: CSSProperties;
	className?: string;
	/** Timeout of the readiness handle held until the lines are measured. Default 30 s. */
	delayRenderTimeoutInMilliseconds?: number;
}

const MARKER_STYLE: CSSProperties = {
	position: "absolute",
	width: 0,
	height: 0,
	overflow: "hidden",
	pointerEvents: "none",
};

const close = (a: number, b: number) => Math.abs(a - b) < 0.01;

function sameMeasurement(a: MeasuredLines | null, b: MeasuredLines): boolean {
	if (!a || a.lines.length !== b.lines.length || !close(a.top, b.top)) return false;
	return a.lines.every((line, i) => {
		const other = b.lines[i];
		return (
			other !== undefined &&
			close(line.width, other.width) &&
			close(line.height, other.height) &&
			close(a.lefts[i] as number, b.lefts[i] as number)
		);
	});
}

function shadowFilter(shadow: TextBackgroundShadow | undefined): string | undefined {
	if (!shadow) return undefined;
	const { offsetX = 0, offsetY = 0, blur = 0, color = "rgba(0, 0, 0, 0.5)" } = shadow;
	return `drop-shadow(${offsetX}px ${offsetY}px ${blur}px ${color})`;
}

/**
 * A block of text with a background shape that follows its lines: one box per line, merged into
 * one outline with convex corners where a line sticks out and concave corners where it is shorter
 * than its neighbour, which CSS backgrounds cannot draw. The component lets the browser lay the
 * text out (wrapping, fonts, `<br />`), measures every line, and draws `makeTextBackground()`'s
 * shape behind it as an SVG with an optional border and shadow. It measures again whenever it
 * renders or a font finishes loading; when rendering, the frame waits until the lines are measured
 * with every font loaded. The measurement is independent of the Player's scale and of transforms
 * on ancestors.
 */
export function TextBackground(props: TextBackgroundProps): ReactNode {
	const {
		children,
		align = "left",
		cornerRadius = 0,
		paddingX = 0,
		paddingY = 0,
		join = "round",
		fill = "white",
		border,
		shadow,
		style,
		className,
		delayRenderTimeoutInMilliseconds,
	} = props;
	const [handle] = useState(() =>
		delayRender(
			"Measuring the lines of <TextBackground>",
			delayRenderTimeoutInMilliseconds === undefined
				? undefined
				: { timeoutInMilliseconds: delayRenderTimeoutInMilliseconds },
		),
	);
	const released = useRef(false);
	const waitingForFonts = useRef(false);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const textRef = useRef<HTMLSpanElement | null>(null);
	const markerRefs = useRef<(HTMLSpanElement | null)[]>([null, null, null]);
	const [measured, setMeasured] = useState<MeasuredLines | null>(null);
	const [, setFontTick] = useState(0);

	// Computed on every render, before anything is measured, so invalid props fail at once.
	const shape: TextBackgroundShape = makeTextBackground({
		lines: measured?.lines ?? [],
		align,
		cornerRadius,
		paddingX,
		paddingY,
		join,
	});

	useLayoutEffect(() => {
		const root = rootRef.current;
		const text = textRef.current;
		const [o, x, y] = markerRefs.current;
		if (!root || !text || !o || !x || !y) return;
		const next = measureLines(root, text, [o, x, y]);
		if (!sameMeasurement(measured, next)) {
			setMeasured(next);
			return;
		}
		if (document.fonts.status === "loading") {
			if (!waitingForFonts.current) {
				waitingForFonts.current = true;
				document.fonts.ready.then(() => {
					waitingForFonts.current = false;
					setFontTick((t) => t + 1);
				});
			}
			return;
		}
		if (!released.current) {
			released.current = true;
			continueRender(handle);
		}
	});

	useEffect(() => {
		const remeasure = () => setFontTick((t) => t + 1);
		document.fonts.addEventListener("loadingdone", remeasure);
		return () => {
			document.fonts.removeEventListener("loadingdone", remeasure);
			if (!released.current) {
				released.current = true;
				continueRender(handle);
			}
		};
	}, [handle]);

	// Where the shape's line boxes land on the measured lines (the block may be wider than its
	// longest line, for example when it has a fixed width).
	const offsetX = measured ? (measured.lefts[0] ?? 0) - (shape.lines[0]?.x ?? 0) : 0;
	const offsetY = measured ? measured.top - paddingY : 0;
	const strokeJoin = join === "sharp" ? "miter" : join;
	const marker = (left: number, top: number, i: number) => (
		<span
			aria-hidden
			ref={(node) => {
				markerRefs.current[i] = node;
			}}
			style={{ ...MARKER_STYLE, left, top }}
		/>
	);
	return (
		<div
			ref={rootRef}
			className={className}
			style={{
				display: "inline-block",
				...style,
				position: style?.position ?? "relative",
				boxSizing: "content-box",
				padding: `${paddingY}px ${paddingX}px`,
				textAlign: align,
			}}
		>
			{marker(0, 0, 0)}
			{marker(MARKER_SPAN, 0, 1)}
			{marker(0, MARKER_SPAN, 2)}
			{shape.width > 0 ? (
				<svg
					aria-hidden
					width={shape.width}
					height={shape.height}
					viewBox={`0 0 ${shape.width} ${shape.height}`}
					style={{
						position: "absolute",
						left: offsetX,
						top: offsetY,
						overflow: "visible",
						pointerEvents: "none",
						...(shadow ? { filter: shadowFilter(shadow) } : {}),
					}}
				>
					<path
						d={shape.path}
						fill={fill}
						{...(border
							? { stroke: border.color, strokeWidth: border.width, strokeLinejoin: strokeJoin }
							: {})}
					/>
				</svg>
			) : null}
			<span ref={textRef} style={{ position: "relative" }}>
				{children}
			</span>
		</div>
	);
}
