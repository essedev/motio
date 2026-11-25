import { AbsoluteFill, interpolate, useCurrentFrame } from "@motiojs/motio";
import { Pie, Star, Triangle } from "@motiojs/shapes";

// region: shapes
// A pie that fills over 60 frames, a triangle with rounded corners and a five-pointed star.
export const Shapes = () => {
	const frame = useCurrentFrame();
	const progress = interpolate(frame, [0, 59], [0, 1]);
	return (
		<AbsoluteFill style={{ flexDirection: "row", gap: 20, alignItems: "center" }}>
			<Pie radius={50} progress={progress} fill="#fb923c" closePath />
			<Triangle length={100} direction="up" fill="#34d399" cornerRadius={8} />
			<Star points={5} innerRadius={25} outerRadius={50} fill="#facc15" />
		</AbsoluteFill>
	);
};
// endregion
