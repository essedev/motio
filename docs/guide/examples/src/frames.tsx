import {
	AbsoluteFill,
	interpolate,
	random,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "@motiojs/motio";

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

// region: product-ui
// Shared with the product as plain data, for example from a module both import: no components.
const tokens = { surface: "#16181d", text: "#f4f4f5", accent: "#7c5cff", radius: 12 };
const tasks = [
	{ id: 1, title: "Import the footage" },
	{ id: 2, title: "Cut the intro" },
	{ id: 3, title: "Export in 4K" },
];

// The product's task panel, rebuilt for the video. In the product it slides in with a CSS
// transition and fills its list when a query resolves; here both follow the frame.
export const TaskPanel = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const enter = spring({ frame, fps, config: { damping: 200 } });
	const shown = Math.floor(
		interpolate(frame, [15, 45], [0, tasks.length], {
			extrapolateLeft: "clamp",
			extrapolateRight: "clamp",
		}),
	);
	return (
		<AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
			<div
				style={{
					width: 420,
					padding: 24,
					borderRadius: tokens.radius,
					backgroundColor: tokens.surface,
					color: tokens.text,
					opacity: enter,
					transform: `translateY(${(1 - enter) * 40}px)`,
				}}
			>
				{tasks.slice(0, shown).map((task) => (
					<div
						key={task.id}
						style={{ padding: "8px 0", borderBottom: `1px solid ${tokens.accent}` }}
					>
						{task.title}
					</div>
				))}
			</div>
		</AbsoluteFill>
	);
};
// endregion
