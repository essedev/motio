import { AbsoluteFill, useVideoConfig } from "@motiojs/core";
import type { CSSProperties } from "react";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "../types.js";

/** Where the entering face of `cube()` comes from. */
export type CubeDirection = "from-left" | "from-right" | "from-top" | "from-bottom";

/** Options of `cube()`. */
export type CubeProps = {
	/** Side the entering scene comes from. */
	direction: CubeDirection;
	/** CSS `perspective` of the rotation, in pixels. Default 1000. */
	perspective?: number;
};

const DIRECTIONS: readonly CubeDirection[] = ["from-left", "from-right", "from-top", "from-bottom"];

/**
 * CSS transform of a scene of `cube()`: both scenes are adjacent faces of a cube that turns by
 * 90 degrees around its centre, `depth` pixels behind the screen (half the scene size along the
 * axis of motion).
 */
export function cubeTransform(
	direction: CubeDirection,
	presentationDirection: "entering" | "exiting",
	progress: number,
	depth: number,
): string {
	const horizontal = direction === "from-left" || direction === "from-right";
	// Rotation that brings the entering face to the front.
	const sign = direction === "from-left" || direction === "from-bottom" ? 1 : -1;
	const turned = progress * 90;
	const angle = presentationDirection === "exiting" ? sign * turned : sign * (turned - 90);
	const axis = horizontal ? "Y" : "X";
	return `translateZ(${-depth}px) rotate${axis}(${angle}deg) translateZ(${depth}px)`;
}

const CubePresentation = ({
	children,
	presentationDirection,
	presentationProgress,
	passedProps,
}: TransitionPresentationComponentProps<CubeProps>) => {
	const { width, height } = useVideoConfig();
	const horizontal =
		passedProps.direction === "from-left" || passedProps.direction === "from-right";
	const depth = (horizontal ? width : height) / 2;
	const outer: CSSProperties = { perspective: passedProps.perspective ?? 1000 };
	const inner: CSSProperties = {
		transform: cubeTransform(
			passedProps.direction,
			presentationDirection,
			presentationProgress,
			depth,
		),
		backfaceVisibility: "hidden",
		WebkitBackfaceVisibility: "hidden",
	};
	return (
		<AbsoluteFill style={outer}>
			<AbsoluteFill style={inner}>{children}</AbsoluteFill>
		</AbsoluteFill>
	);
};

/** Both scenes are faces of a cube that turns in 3D to bring the entering scene to the front. */
export function cube(props: CubeProps): TransitionPresentation<CubeProps> {
	if (!props || !DIRECTIONS.includes(props.direction)) {
		throw new TypeError(
			`cube(): "direction" is required and must be one of ${DIRECTIONS.join(", ")}, got ${String(props?.direction)}.`,
		);
	}
	return { component: CubePresentation, props };
}
