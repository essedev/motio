import { AbsoluteFill, useCurrentFrame } from "@motiojs/motio";
import { noise2D } from "@motiojs/noise";

// region: noise
// A grid of dots, each drifting smoothly along its own noise field.
export const Drift = () => {
	const frame = useCurrentFrame();
	const dots = [];
	for (let y = 0; y < 9; y++) {
		for (let x = 0; x < 16; x++) {
			const dx = noise2D("x", x / 5, frame / 30 + y / 5) * 14;
			const dy = noise2D("y", y / 5, frame / 30 + x / 5) * 14;
			dots.push(
				<div
					key={`${x}-${y}`}
					style={{
						position: "absolute",
						left: 20 + x * 38 + dx,
						top: 20 + y * 38 + dy,
						width: 12,
						height: 12,
						borderRadius: 6,
						background: "#0ea5e9",
					}}
				/>,
			);
		}
	}
	return <AbsoluteFill style={{ backgroundColor: "#082f49" }}>{dots}</AbsoluteFill>;
};
// endregion
