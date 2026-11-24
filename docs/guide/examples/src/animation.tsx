import {
	AbsoluteFill,
	Easing,
	interpolate,
	interpolateColors,
	measureSpring,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "@motiojs/motio";

// region: interpolate
export const LowerThird = ({ name }: { name: string }) => {
	const frame = useCurrentFrame();
	const { durationInFrames } = useVideoConfig();
	// Slides in during frames 10-25, stays, slides out during the last 15 frames.
	const left = interpolate(
		frame,
		[10, 25, durationInFrames - 15, durationInFrames],
		[-600, 60, 60, -600],
		{ easing: Easing.out(Easing.quad), extrapolateLeft: "clamp", extrapolateRight: "clamp" },
	);
	// Without clamping, the bar would keep growing after frame 40.
	const barWidth = interpolate(frame, [18, 40], [0, 420], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	return (
		<AbsoluteFill>
			<div style={{ position: "absolute", left, bottom: 120, fontSize: 56, color: "white" }}>
				{name}
				<div style={{ width: barWidth, height: 6, backgroundColor: "#ffb000" }} />
			</div>
		</AbsoluteFill>
	);
};
// endregion

// region: spring
export const Badge = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	// From 0 to 1 with a physical spring, starting at frame 10; it overshoots, then settles.
	const grow = spring({ frame, fps, delay: 10, config: { damping: 12, stiffness: 120 } });
	// A spring stretched to exactly 30 frames, without bounce.
	const rise = spring({ frame, fps, durationInFrames: 30, config: { damping: 200 } });
	return (
		<AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
			<div
				style={{
					width: 240 * grow,
					height: 240 * grow,
					borderRadius: "50%",
					backgroundColor: "#ffb000",
					marginTop: interpolate(rise, [0, 1], [200, 0]),
				}}
			/>
		</AbsoluteFill>
	);
};

// How many frames the spring takes to settle, for example to size a Sequence.
export const badgeFrames = measureSpring({ fps: 30, config: { damping: 12, stiffness: 120 } });
// endregion

// region: colors
export const Sunset = () => {
	const frame = useCurrentFrame();
	const backgroundColor = interpolateColors(frame, [0, 60, 120], ["#87ceeb", "#ff8c42", "#2b1055"]);
	return <AbsoluteFill style={{ backgroundColor }} />;
};
// endregion

// region: easing
// Built-in curves, composable: Easing.in, Easing.out and Easing.inOut wrap any of them.
export const curves = [
	Easing.linear,
	Easing.out(Easing.quad),
	Easing.inOut(Easing.exp),
	Easing.bezier(0.33, 1, 0.68, 1),
	Easing.elastic(1),
];
// endregion
