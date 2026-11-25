import { AbsoluteFill, interpolate, useCurrentFrame } from "@motiojs/motio";
import { Starburst } from "@motiojs/starburst";

// region: rotating
// Sixteen rays in three colours, turning once over 60 frames.
export const Rotating = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{ backgroundColor: "black" }}>
			<Starburst
				rays={16}
				colors={["#ffdd00", "#ff8800", "#ff4400"]}
				rotation={interpolate(frame, [0, 59], [0, 360])}
				smoothness={0.1}
			/>
		</AbsoluteFill>
	);
};
// endregion
