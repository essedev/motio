import {
	AbsoluteFill,
	Easing,
	interpolate,
	interpolateColors,
	random,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";

/** spring, Easing, interpolateColors and seeded random driving geometry. */
export const Motion: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const s = spring({ frame, fps, config: { damping: 10, stiffness: 120, mass: 0.8 } });
	const eased = interpolate(frame, [0, 45], [0, 1], {
		easing: Easing.bezier(0.33, 1, 0.68, 1),
		extrapolateRight: "clamp",
	});
	const bg = interpolateColors(frame, [0, 30, 60], ["#1e3a8a", "#9d174d", "rgb(20, 120, 80)"]);
	return (
		<AbsoluteFill style={{ backgroundColor: bg }}>
			<div
				style={{
					position: "absolute",
					left: 40,
					top: 60,
					width: 120,
					height: 120,
					borderRadius: 24,
					background: "#fde047",
					transform: `scale(${s}) rotate(${eased * 180}deg)`,
				}}
			/>
			{Array.from({ length: 24 }, (_, i) => (
				<div
					key={i}
					style={{
						position: "absolute",
						left: 220 + random(`x${i}`) * 380,
						top: 20 + random(`y${i}`) * 300,
						width: 14,
						height: 14,
						borderRadius: 7,
						background: "white",
						opacity: interpolate(frame, [i, i + 10], [0, 1], {
							extrapolateLeft: "clamp",
							extrapolateRight: "clamp",
						}),
					}}
				/>
			))}
		</AbsoluteFill>
	);
};
