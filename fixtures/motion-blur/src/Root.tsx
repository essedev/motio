import { CameraMotionBlur, Trail } from "@remotion/motion-blur";
import {
	AbsoluteFill,
	Composition,
	interpolate,
	interpolateColors,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";

const size = { width: 640, height: 360, fps: 30 } as const;

// A square crossing the frame fast, rotating and changing colour, and a ring rising, over a
// gradient.
const Mover: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const x = interpolate(frame, [0, 59], [-60, 600]);
	const y = 150 + Math.sin(frame / 6) * 80;
	const scale = spring({ frame, fps, config: { damping: 12 } });
	return (
		<AbsoluteFill>
			<div
				style={{
					position: "absolute",
					left: x,
					top: y,
					width: 80,
					height: 80,
					borderRadius: 16,
					transform: `rotate(${frame * 9}deg) scale(${scale})`,
					backgroundColor: interpolateColors(frame, [0, 59], ["#ff3366", "#33ccff"]),
				}}
			/>
			<div
				style={{
					position: "absolute",
					left: 60,
					top: interpolate(frame, [0, 59], [280, 30]),
					width: 50,
					height: 50,
					borderRadius: "50%",
					border: "6px solid #1d2b53",
				}}
			/>
		</AbsoluteFill>
	);
};

const Background: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<AbsoluteFill style={{ background: "linear-gradient(135deg, #fff1e6, #e0f0ff)" }}>
		{children}
	</AbsoluteFill>
);

const Camera: React.FC = () => (
	<Background>
		<CameraMotionBlur>
			<Mover />
		</CameraMotionBlur>
	</Background>
);

const CameraWide: React.FC = () => (
	<Background>
		<CameraMotionBlur shutterAngle={360} samples={6}>
			<Mover />
		</CameraMotionBlur>
	</Background>
);

const TrailScene: React.FC = () => (
	<Background>
		<Trail layers={8} lagInFrames={0.75} trailOpacity={0.9}>
			<Mover />
		</Trail>
	</Background>
);

export const Root: React.FC = () => (
	<>
		<Composition id="camera" component={Camera} durationInFrames={60} {...size} />
		<Composition id="camera-wide" component={CameraWide} durationInFrames={60} {...size} />
		<Composition id="trail" component={TrailScene} durationInFrames={60} {...size} />
	</>
);
