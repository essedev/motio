# @motiojs/light-leaks

Light leak overlays for [Motio](https://motio.esse.dev): `<LightLeak>` draws a warm glow with WebGL 2 that reveals over the first half of its duration and retracts over the second, recomputed from the frame on every render.

```bash
pnpm add @motiojs/light-leaks
```

## A leak over a cut

<!-- example: ../../docs/guide/examples/src/packages/light-leaks.tsx#cut -->
```tsx
import { LightLeak } from "@motiojs/light-leaks";
import { AbsoluteFill, Sequence } from "@motiojs/motio";

// A leak of 20 frames centred on a cut from blue to pink, at frame 30.
export const Cut = () => (
	<AbsoluteFill>
		<Sequence durationInFrames={30}>
			<AbsoluteFill style={{ backgroundColor: "#0b84f3" }} />
		</Sequence>
		<Sequence from={30}>
			<AbsoluteFill style={{ backgroundColor: "pink" }} />
		</Sequence>
		<LightLeak from={20} durationInFrames={20} seed={5} hueShift={240} />
	</AbsoluteFill>
);
```

## Props

| Prop | What it does |
|---|---|
| `durationInFrames` | Length of the leak. Default: the duration of the composition or of the enclosing sequence. |
| `seed` | Shape of the pattern; different seeds give different leaks. Default 0. |
| `hueShift` | Hue rotation in degrees, from 0 (yellow to orange, the default) to 360. |
| `width`, `height` | Size of the canvas in pixels. Default: the size of the composition. |
| `style`, `className` | Styles and class of the container, an absolute fill. |
| `layout` | `"absolute-fill"` (default) wraps the canvas in a container; `"none"` does not. |

`<LightLeak>` also accepts the `<Sequence>` props (`from` above); its ref is the container. The output is a pure function of the frame, the seed and the size.

## Compatibility

The compat alias maps `@remotion/light-leaks` here. `<LightLeak>` has the published props, markup and timing, but draws Motio's own pattern: Remotion's shader is not documented, so the pixels differ. `lightLeak()` needs an effect pipeline Motio does not have and throws; `lightLeakEffectSchema` is the published data.

Documentation: [motio.esse.dev/reference/packages/light-leaks](https://motio.esse.dev/reference/packages/light-leaks/) · Source: [packages/light-leaks](https://github.com/essedev/motio/tree/main/packages/light-leaks)
