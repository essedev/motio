import { Sequence, type SequenceProps } from "@motiojs/core";
import type { Instruction } from "@motiojs/paths";
import type { CSSProperties, ReactNode, SVGProps } from "react";
import type { ShapeInfo } from "./shape-info.js";

const SEQUENCE_PROP_NAMES = [
	"from",
	"durationInFrames",
	"trimBefore",
	"playbackRate",
	"loop",
	"freeze",
	"name",
	"showInTimeline",
	"hidden",
	"premountFor",
	"postmountFor",
	"styleWhilePremounted",
	"styleWhilePostmounted",
] as const;

/** `<Sequence>` timing props that every shape component accepts. */
export type ShapeSequenceProps = Pick<SequenceProps, (typeof SEQUENCE_PROP_NAMES)[number]>;

/** Props shared by every shape component, compatible with Remotion's shape components. */
export type AllShapesProps = Omit<SVGProps<SVGPathElement>, "width" | "height" | "d" | "ref"> &
	ShapeSequenceProps & {
		/** Draws the Bézier control points, for debugging. */
		debug?: boolean;
		/** CSS of the `<svg>`; `overflow: visible` by default. */
		style?: CSSProperties;
		/** CSS of the `<path>`; by default the shape rotates around its centre. */
		pathStyle?: CSSProperties;
		/**
		 * Effects applied after painting to a canvas in Remotion. Not supported
		 * by Motio: a non-empty array throws.
		 */
		effects?: readonly unknown[];
		/** Not supported by Motio (see `effects`). */
		effectsOutputSize?: unknown;
		/** Not supported by Motio (see `effects`). */
		pixelDensity?: number;
	};

const DEBUG_LINE = { strokeWidth: 2, stroke: "rgba(0, 0, 0, 0.4)" } as const;

/** Control-point overlay drawn by `debug`: a line and a dot per control point of each cubic. */
const debugOverlay = (instructions: Instruction[]): ReactNode[] => {
	const nodes: ReactNode[] = [];
	let x = 0;
	let y = 0;
	let startX = 0;
	let startY = 0;
	instructions.forEach((i, index) => {
		if (i.type === "C") {
			nodes.push(
				<path key={`${index}-a`} d={`M ${x} ${y} ${i.cp1x} ${i.cp1y}`} {...DEBUG_LINE} />,
				<path key={`${index}-b`} d={`M ${i.x} ${i.y} ${i.cp2x} ${i.cp2y}`} {...DEBUG_LINE} />,
				<circle
					key={`${index}-c`}
					cx={i.cp1x}
					cy={i.cp1y}
					r={3}
					fill="white"
					strokeWidth={2}
					stroke="black"
				/>,
				<circle
					key={`${index}-d`}
					cx={i.cp2x}
					cy={i.cp2y}
					r={3}
					strokeWidth={2}
					fill="white"
					stroke="black"
				/>,
			);
		}
		switch (i.type) {
			case "Z":
				x = startX;
				y = startY;
				break;
			case "M":
			case "L":
			case "C":
			case "S":
			case "Q":
			case "T":
			case "A":
				x = i.x;
				y = i.y;
				if (i.type === "M") {
					startX = x;
					startY = y;
				}
				break;
			case "H":
				x = i.x;
				break;
			case "V":
				y = i.y;
				break;
			case "h":
				x += i.dx;
				break;
			case "v":
				y += i.dy;
				break;
			default:
				x += i.dx;
				y += i.dy;
				if (i.type === "m") {
					startX = x;
					startY = y;
				}
		}
	});
	return nodes;
};

/** Renders a shape as an `<svg>` sized to it, with its path. */
export const RenderSvg = ({
	shape,
	props,
}: {
	shape: ShapeInfo;
	props: AllShapesProps;
}): ReactNode => {
	const {
		debug,
		style,
		pathStyle,
		effects,
		effectsOutputSize: _effectsOutputSize,
		pixelDensity: _pixelDensity,
		...rest
	} = props;
	if (effects !== undefined && effects.length > 0) {
		throw new Error(
			"Shape effects are not supported by Motio. Remove the effects prop, or apply the effect with CSS or a canvas yourself.",
		);
	}
	const sequenceProps: Record<string, unknown> = {};
	const pathProps: Record<string, unknown> = {};
	let wrap = false;
	for (const [key, value] of Object.entries(rest)) {
		if ((SEQUENCE_PROP_NAMES as readonly string[]).includes(key)) {
			sequenceProps[key] = value;
			if (value !== undefined) wrap = true;
		} else {
			pathProps[key] = value;
		}
	}
	const svg = (
		<svg
			width={shape.width}
			height={shape.height}
			viewBox={`0 0 ${shape.width} ${shape.height}`}
			xmlns="http://www.w3.org/2000/svg"
			style={{ overflow: "visible", ...style }}
		>
			<path
				transform-origin={shape.transformOrigin}
				d={shape.path}
				style={{ transformBox: "fill-box", ...pathStyle }}
				{...pathProps}
			/>
			{debug ? debugOverlay(shape.instructions) : null}
		</svg>
	);
	if (!wrap) return svg;
	return (
		<Sequence layout="none" {...(sequenceProps as ShapeSequenceProps)}>
			{svg}
		</Sequence>
	);
};
