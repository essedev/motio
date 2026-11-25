# @motiojs/three

React Three Fiber scenes for [Motio](https://motio.esse.dev): `<ThreeCanvas>` is a canvas whose scene follows the timeline. `useCurrentFrame()` and the other hooks work inside it, and while rendering the scene is drawn once per frame, after the tree has committed it.

```bash
pnpm add @motiojs/three three @react-three/fiber
```

## A scene

Animate declaratively from the frame, not with `useFrame()`. `width` and `height` are required: the canvas is not measured.

<!-- example: ../../docs/guide/examples/src/packages/three.tsx#scene -->
```tsx
import {
	AbsoluteFill,
	interpolateColors,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "@motiojs/motio";
import { ThreeCanvas } from "@motiojs/three";

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
```

## Exports

| Export | What it does |
|---|---|
| `<ThreeCanvas>` | React Three Fiber's `<Canvas>` props (`camera`, `gl`, `linear`, `flat`, `orthographic`, `dpr`, `shadows`, ...), a fixed `width` and `height`, and the `<Sequence>` timing props. A `<Sequence>` inside it needs `layout="none"`. Textures updated asynchronously should call `advance(performance.now())`. |
| `useVideoTexture()`, `useOffthreadVideoTexture()` | Deprecated by Remotion and not implemented: they throw with the replacement the Remotion docs give. |

## Compatibility

The compat alias maps `@remotion/three` here.

Documentation: [motio.esse.dev/reference/packages/three](https://motio.esse.dev/reference/packages/three/) · Source: [packages/three](https://github.com/essedev/motio/tree/main/packages/three)
