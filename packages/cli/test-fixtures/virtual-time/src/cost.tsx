import {
	AbsoluteFill,
	Composition,
	registerRoot,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";

// A separate entry to measure what the virtual time model costs over the frame model on
// frame-driven content. Separate because the clock-driven fixture starts a ticker on
// requestAnimationFrame when its module loads, which in the frame model keeps Chrome drawing
// frames and slows every capture.

/** Frame-driven boxes at 1080p, to measure what the virtual model costs over the frame model. */
function FrameDriven() {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	return (
		<AbsoluteFill style={{ background: "#202830" }}>
			{Array.from({ length: 24 }, (_, i) => {
				const s = spring({ frame: frame - i * 4, fps, config: { damping: 12 } });
				return (
					<div
						key={i}
						style={{
							position: "absolute",
							left: 80 + (i % 6) * 300,
							top: 120 + Math.floor(i / 6) * 220,
							width: 160,
							height: 160,
							borderRadius: 24,
							background: `hsl(${(i * 37 + frame * 2) % 360}deg 75% 55%)`,
							transform: `translateY(${(1 - s) * 200}px) rotate(${frame * (i % 3)}deg) scale(${0.5 + s / 2})`,
						}}
					/>
				);
			})}
		</AbsoluteFill>
	);
}

function Root() {
	return (
		<Composition
			id="frame-driven-1080p"
			component={FrameDriven}
			width={1920}
			height={1080}
			fps={30}
			durationInFrames={300}
		/>
	);
}

registerRoot(Root);
