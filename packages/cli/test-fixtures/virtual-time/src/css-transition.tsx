import { AbsoluteFill, useCurrentFrame } from "remotion";

// A style set from the frame, animated by a CSS transition: the box jumps to x = 200 at frame
// 10 and the transition moves it there linearly over one second. In the virtual time model the
// transition plays from frame 10, where the style changed; in the frame model a frame depends on
// its number only, so the box shows the transition's end at once.

export function CssTransition() {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{ background: "black" }}>
			<div
				style={{
					position: "absolute",
					left: 0,
					top: 80,
					width: 20,
					height: 20,
					background: "white",
					transform: `translateX(${frame >= 10 ? 200 : 0}px)`,
					transition: "transform 1s linear",
				}}
			/>
		</AbsoluteFill>
	);
}
