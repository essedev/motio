import { HtmlInCanvasMotionBlur } from "@remotion/motion-blur";
import { AbsoluteFill, Composition, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

const size = { width: 320, height: 180, fps: 30, durationInFrames: 30 } as const;

// The documented example, scaled to the composition.
const MovingBox: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<div
			style={{
				position: "absolute",
				left: frame * 10,
				top: 30,
				width: 60,
				height: 60,
				backgroundColor: "#ff6b6b",
			}}
		/>
	);
};

const Documented: React.FC = () => {
	const { width, height } = useVideoConfig();
	return (
		<AbsoluteFill style={{ backgroundColor: "white" }}>
			<HtmlInCanvasMotionBlur width={width} height={height} samples={8} shutterAngle={180}>
				<MovingBox />
			</HtmlInCanvasMotionBlur>
		</AbsoluteFill>
	);
};

// A spinning, colour-changing card with text over a gradient, half transparent in places.
const Card: React.FC = () => {
	const frame = useCurrentFrame();
	const angle = interpolate(frame, [0, 29], [0, 540]);
	return (
		<AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
			<div
				style={{
					width: 120,
					height: 70,
					borderRadius: 12,
					transform: `rotate(${angle}deg) translateX(${frame * 2}px)`,
					background: `hsla(${frame * 12}, 80%, 55%, 0.85)`,
					color: "white",
					fontFamily: "sans-serif",
					fontSize: 28,
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
				}}
			>
				Blur
			</div>
		</AbsoluteFill>
	);
};

const Options: React.FC = () => (
	<AbsoluteFill style={{ background: "linear-gradient(90deg, #12355b, #0b84f3)" }}>
		<HtmlInCanvasMotionBlur width={320} height={180} samples={16} shutterAngle={360}>
			<Card />
		</HtmlInCanvasMotionBlur>
	</AbsoluteFill>
);

// Sequence timing: starts at frame 5, twice as fast, trimmed by 4 frames, on a transparent
// background.
const Timing: React.FC = () => (
	<AbsoluteFill>
		<HtmlInCanvasMotionBlur
			width={320}
			height={180}
			from={5}
			durationInFrames={20}
			trimBefore={4}
			playbackRate={2}
			samples={6}
		>
			<MovingBox />
		</HtmlInCanvasMotionBlur>
	</AbsoluteFill>
);

// A canvas smaller than the composition, blurred and disabled.
const Small: React.FC<{ disabled: boolean }> = ({ disabled }) => (
	<AbsoluteFill style={{ backgroundColor: "#222" }}>
		<HtmlInCanvasMotionBlur width={160} height={90} samples={4} disabled={disabled}>
			<Card />
		</HtmlInCanvasMotionBlur>
	</AbsoluteFill>
);

export const Root: React.FC = () => (
	<>
		<Composition id="documented" component={Documented} {...size} />
		<Composition id="options" component={Options} {...size} />
		<Composition id="timing" component={Timing} {...size} />
		<Composition id="small" component={Small} defaultProps={{ disabled: false }} {...size} />
		<Composition
			id="small-disabled"
			component={Small}
			defaultProps={{ disabled: true }}
			{...size}
		/>
	</>
);
