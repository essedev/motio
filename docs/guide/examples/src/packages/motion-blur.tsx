import { AbsoluteFill, interpolate, useCurrentFrame } from "@motiojs/motio";
import { CameraMotionBlur } from "@motiojs/motion-blur";

// region: camera
// A square crossing the frame fast, rotating as it goes.
const Mover = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill>
			<div
				style={{
					position: "absolute",
					left: interpolate(frame, [0, 59], [-60, 600]),
					top: 150,
					width: 80,
					height: 80,
					borderRadius: 16,
					transform: `rotate(${frame * 9}deg)`,
					backgroundColor: "#ff3366",
				}}
			/>
		</AbsoluteFill>
	);
};

// Each frame adds up 6 samples over a full frame of exposure.
export const Blurred = () => (
	<CameraMotionBlur shutterAngle={360} samples={6}>
		<Mover />
	</CameraMotionBlur>
);
// endregion
