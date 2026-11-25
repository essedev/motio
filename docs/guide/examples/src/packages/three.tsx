import {
	AbsoluteFill,
	interpolateColors,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "@motiojs/motio";
import { ThreeCanvas } from "@motiojs/three";

// region: scene
// A box that springs in and spins, animated from the frame, never with useFrame().
const Box = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const enter = spring({ frame, fps, config: { damping: 200 } });
	return (
		<mesh rotation={[frame * 0.06, frame * 0.07, 0]} scale={enter}>
			<boxGeometry args={[100, 100, 100]} />
			<meshStandardMaterial color={interpolateColors(frame, [0, 59], ["#ff4466", "#33aaff"])} />
		</mesh>
	);
};

export const Scene = () => {
	const { width, height } = useVideoConfig();
	return (
		<AbsoluteFill style={{ backgroundColor: "#f4f1ea" }}>
			<ThreeCanvas width={width} height={height} camera={{ fov: 60, position: [0, 0, 470] }}>
				<ambientLight intensity={0.4} />
				<directionalLight position={[200, 300, 200]} intensity={2.5} />
				<Box />
			</ThreeCanvas>
		</AbsoluteFill>
	);
};
// endregion
