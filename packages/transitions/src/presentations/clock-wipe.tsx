import { AbsoluteFill } from "@motiojs/core";
import type { CSSProperties } from "react";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "../types.js";
import { validateSize } from "./size.js";

/** Options of `clockWipe()`. */
export type ClockWipeProps = {
	/** Width of the video. */
	width: number;
	/** Height of the video. */
	height: number;
	/** Style of the outer element while the scene is entering. */
	outerEnterStyle?: CSSProperties;
	/** Style of the outer element while the scene is exiting. */
	outerExitStyle?: CSSProperties;
	/** Style of the inner element while the scene is entering. */
	innerEnterStyle?: CSSProperties;
	/** Style of the inner element while the scene is exiting. */
	innerExitStyle?: CSSProperties;
};

const round = (n: number) => Number(n.toFixed(4));

/**
 * SVG path of the sector revealed by a clock wipe at `progress`: it starts at 12 o'clock and
 * sweeps clockwise around the centre, with a radius that covers the corners.
 */
export function clockWipePath(width: number, height: number, progress: number): string {
	const p = Math.min(1, Math.max(0, progress));
	const cx = width / 2;
	const cy = height / 2;
	const r = Math.ceil(Math.sqrt(width * width + height * height) / 2) + 1;
	const top = `${round(cx)} ${round(cy - r)}`;
	if (p >= 1) {
		// Two half circles: an arc cannot end where it starts.
		return `M ${round(cx)} ${round(cy)} L ${top} A ${r} ${r} 0 1 1 ${round(cx)} ${round(cy + r)} A ${r} ${r} 0 1 1 ${top} Z`;
	}
	const angle = p * 2 * Math.PI;
	const x = cx + r * Math.sin(angle);
	const y = cy - r * Math.cos(angle);
	const largeArc = angle > Math.PI ? 1 : 0;
	return `M ${round(cx)} ${round(cy)} L ${top} A ${r} ${r} 0 ${largeArc} 1 ${round(x)} ${round(y)} Z`;
}

const ClockWipePresentation = ({
	children,
	presentationDirection,
	presentationProgress,
	passedProps,
}: TransitionPresentationComponentProps<ClockWipeProps>) => {
	const entering = presentationDirection === "entering";
	const { width, height } = passedProps;
	const inner: CSSProperties = {
		...(entering
			? { clipPath: `path("${clockWipePath(width, height, presentationProgress)}")` }
			: null),
		...(entering ? passedProps.innerEnterStyle : passedProps.innerExitStyle),
	};
	const outer = entering ? passedProps.outerEnterStyle : passedProps.outerExitStyle;
	return (
		<AbsoluteFill {...(outer ? { style: outer } : null)}>
			<AbsoluteFill style={inner}>{children}</AbsoluteFill>
		</AbsoluteFill>
	);
};

/**
 * The exiting scene is wiped away like a clock hand, from 12 o'clock clockwise, revealing the
 * entering scene. Pass the size of the video.
 */
export function clockWipe(props: ClockWipeProps): TransitionPresentation<ClockWipeProps> {
	validateSize("clockWipe", props?.width, props?.height);
	return { component: ClockWipePresentation, props };
}
