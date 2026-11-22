import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily } from "../fonts";

/** Frame-driven text, opacity and translation; checks useVideoConfig fields as text. */
export const Basics: React.FC<{ title: string }> = ({ title }) => {
	const frame = useCurrentFrame();
	const { width, height, fps, durationInFrames, id } = useVideoConfig();
	const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
	const x = interpolate(frame, [0, durationInFrames - 1], [-200, 200]);
	return (
		<AbsoluteFill
			style={{
				backgroundColor: "#0b1020",
				justifyContent: "center",
				alignItems: "center",
				fontFamily,
			}}
		>
			<div
				style={{
					color: "white",
					fontSize: 56,
					fontWeight: 700,
					opacity,
					transform: `translateX(${x}px)`,
				}}
			>
				{title}
			</div>
			<div style={{ position: "absolute", bottom: 24, color: "#9ab", fontSize: 20 }}>
				{`${id} ${width}x${height} ${fps}fps ${durationInFrames}f frame ${frame}`}
			</div>
		</AbsoluteFill>
	);
};
