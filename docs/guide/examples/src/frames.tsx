import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "motio";

// region: clock
export const Clock = () => {
	const frame = useCurrentFrame();
	const { fps, durationInFrames, width, height } = useVideoConfig();
	const seconds = frame / fps;
	return (
		<AbsoluteFill style={{ justifyContent: "center", alignItems: "center", fontSize: 64 }}>
			Frame {frame} of {durationInFrames} ({seconds.toFixed(2)} s) at {width}x{height}
		</AbsoluteFill>
	);
};
// endregion

// region: random
export const Stars = () => {
	const { width, height } = useVideoConfig();
	// random(seed) returns the same number between 0 and 1 for the same seed, on every frame,
	// page and machine. Math.random() would change on every render.
	const stars = Array.from({ length: 50 }, (_, i) => ({
		x: random(`x-${i}`) * width,
		y: random(`y-${i}`) * height,
	}));
	return (
		<AbsoluteFill style={{ backgroundColor: "black" }}>
			{stars.map((star, i) => (
				<div
					key={`${star.x}-${star.y}`}
					style={{
						position: "absolute",
						left: star.x,
						top: star.y,
						width: 3,
						height: 3,
						borderRadius: 2,
						backgroundColor: "white",
						opacity: random(`o-${i}`),
					}}
				/>
			))}
		</AbsoluteFill>
	);
};
// endregion
