import { AbsoluteFill, interpolate, useCurrentFrame } from "@motiojs/motio";

export const Main = ({ text }: { text: string }) => {
	const frame = useCurrentFrame();
	// Fade in over the first second (30 frames), then hold.
	const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
	return (
		<AbsoluteFill
			style={{ backgroundColor: "#101820", justifyContent: "center", alignItems: "center" }}
		>
			<h1 style={{ color: "white", fontFamily: "sans-serif", fontSize: 96, opacity }}>{text}</h1>
		</AbsoluteFill>
	);
};
