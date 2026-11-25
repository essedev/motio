# @motiojs/motion-blur

Motion blur and trails for [Motio](https://motio.esse.dev): the children are rendered several times at nearby moments and the copies are combined into one frame.

```bash
pnpm add @motiojs/motion-blur
```

## Blur like a film camera

<!-- example: ../../docs/guide/examples/src/packages/motion-blur.tsx#camera -->
```tsx
import { AbsoluteFill, interpolate, useCurrentFrame } from "@motiojs/motio";
import { CameraMotionBlur } from "@motiojs/motion-blur";

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
```

## Exports

| Export | What it does |
|---|---|
| `<CameraMotionBlur>` | Renders the children `samples` times (default 10) over the exposure, `shutterAngle / 360` of a frame after the current one (default 180), and adds them up at `1 / samples` opacity. Children must be absolutely positioned; colours can shift, so keep `samples` low. |
| `<Trail>` | Repeats the children behind themselves at earlier moments: `layers` copies, each `lagInFrames` behind the one above, fading from `trailOpacity` to transparent. Previously called `<MotionBlur>`. |
| `<HtmlInCanvasMotionBlur>` | Blur on any content through Chrome's HTML-in-canvas API: the children are laid out `samples` times (default 8) in a `width` by `height` canvas, over `shutterAngle / 360` of a frame centred on the current one (default 180), and averaged. Without the API they are shown unblurred. Accepts the `<Sequence>` timing props. |
| `motionBlurSampleFrames()` | The child frames `<HtmlInCanvasMotionBlur>` samples at a given frame. |

## Compatibility

The compat alias maps `@remotion/motion-blur` here. The markup and sample times follow Remotion's renders.

Documentation: [motio.esse.dev/reference/packages/motion-blur](https://motio.esse.dev/reference/packages/motion-blur/) · Source: [packages/motion-blur](https://github.com/essedev/motio/tree/main/packages/motion-blur)
