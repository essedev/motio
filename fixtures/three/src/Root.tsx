import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { useEffect } from "react";
import {
	AbsoluteFill,
	Composition,
	interpolate,
	interpolateColors,
	Sequence,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";

const size = { width: 640, height: 360, fps: 30 } as const;

// Spinning, scaling box with a standard material, the example of the <ThreeCanvas> docs.
const Box: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const enter = spring({ frame, fps, config: { damping: 200 } });
	return (
		<mesh
			position={[-120, 0, 0]}
			rotation={[frame * 0.06, frame * 0.07, 0]}
			scale={interpolate(Math.sin(frame / 10), [-1, 1], [0.8, 1.2]) * enter}
		>
			<boxGeometry args={[100, 100, 100]} />
			<meshStandardMaterial
				color={interpolateColors(frame, [0, 59], ["#ff4466", "#33aaff"])}
				roughness={0.4}
				metalness={0.2}
			/>
		</mesh>
	);
};

// Shown from frame 20 through a Sequence with layout="none", as the docs require in a canvas.
const Orb: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<mesh position={[130, interpolate(frame, [0, 39], [-60, 60]), 0]}>
			<sphereGeometry args={[55, 48, 32]} />
			<meshPhongMaterial color="#ffd23f" shininess={80} />
		</mesh>
	);
};

// A camera placed in an effect: the scene must be drawn after it.
const LookAtOrigin: React.FC = () => {
	const camera = useThree((state) => state.camera);
	useEffect(() => {
		camera.position.set(0, 80, 470);
		camera.lookAt(0, 0, 0);
	}, [camera]);
	return null;
};

const Scene: React.FC = () => {
	const { width, height } = useVideoConfig();
	return (
		<AbsoluteFill style={{ backgroundColor: "#f4f1ea" }}>
			<ThreeCanvas width={width} height={height} camera={{ fov: 60, position: [0, 0, 470] }}>
				<LookAtOrigin />
				<ambientLight intensity={0.4} />
				<directionalLight position={[200, 300, 200]} intensity={2.5} />
				<pointLight position={[-200, -100, 300]} intensity={1.5} decay={0} />
				<Box />
				<Sequence from={20} layout="none">
					<Orb />
				</Sequence>
			</ThreeCanvas>
		</AbsoluteFill>
	);
};

// The <Sequence> timing props of <ThreeCanvas> (4.0.528), a transparent canvas over a 2D layer
// and the `linear` and `flat` options.
const Timing: React.FC = () => {
	const { width, height } = useVideoConfig();
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{ backgroundColor: "#1d2b53" }}>
			<AbsoluteFill
				style={{
					background: `linear-gradient(90deg, #1d2b53, #7e2553 ${interpolate(frame, [0, 29], [20, 80])}%)`,
				}}
			/>
			<AbsoluteFill>
				<ThreeCanvas
					width={width}
					height={height}
					from={5}
					playbackRate={2}
					linear
					flat
					orthographic
					camera={{ zoom: 1, position: [0, 0, 300] }}
				>
					<Torus />
				</ThreeCanvas>
			</AbsoluteFill>
		</AbsoluteFill>
	);
};

const Torus: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<mesh rotation={[0.6, frame * 0.1, 0]}>
			<torusKnotGeometry args={[70, 22, 128, 24]} />
			<meshNormalMaterial />
		</mesh>
	);
};

export const Root: React.FC = () => (
	<>
		<Composition id="three" component={Scene} durationInFrames={60} {...size} />
		<Composition id="three-timing" component={Timing} durationInFrames={30} {...size} />
	</>
);
