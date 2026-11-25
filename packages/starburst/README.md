# @motiojs/starburst

Starburst rays for [Motio](https://motio.esse.dev): `<Starburst>` draws rays of alternating colours around an origin with WebGL 2, on a canvas that fills the composition, redrawn from its props on every frame.

```bash
pnpm add @motiojs/starburst
```

## A turning burst

<!-- example: ../../docs/guide/examples/src/packages/starburst.tsx#rotating -->
```tsx
import { AbsoluteFill, interpolate, useCurrentFrame } from "@motiojs/motio";
import { Starburst } from "@motiojs/starburst";

// Sixteen rays in three colours, turning once over 60 frames.
export const Rotating = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{ backgroundColor: "black" }}>
			<Starburst
				rays={16}
				colors={["#ffdd00", "#ff8800", "#ff4400"]}
				rotation={interpolate(frame, [0, 59], [0, 360])}
				smoothness={0.1}
			/>
		</AbsoluteFill>
	);
};
```

## Props

| Prop | What it does |
|---|---|
| `rays` | Number of rays, from 2 to 100. |
| `colors` | CSS colours of the rays, at least 2, used in turn; their alpha is ignored. |
| `rotation` | Rotation in degrees, clockwise. Default 0. |
| `smoothness` | Softness of the ray edges, from 0 (hard, the default) to 1. |
| `vignette` | Radial fade to transparency, from 0 (off) to 1 (the default). |
| `originOffsetX`, `originOffsetY` | Shift of the origin; 0.5 reaches the edge. Default 0. |
| `width`, `height` | Size of the canvas in pixels. Default: the size of the composition. |
| `style`, `className`, `layout` | The container, an absolute fill unless `layout="none"`. |

`<Starburst>` also accepts the `<Sequence>` props; its ref is the container.

## Compatibility

The compat alias maps `@remotion/starburst` here. The rays were rebuilt from Remotion's renders: stills are identical or within a few levels of the vignette, except some fractional ray counts at large rotations, where the colours differ. `starburst()` needs an effect pipeline Motio does not have and throws; `starburstEffectSchema` is the published data.

Documentation: [motio.esse.dev/reference/packages/starburst](https://motio.esse.dev/reference/packages/starburst/) · Source: [packages/starburst](https://github.com/essedev/motio/tree/main/packages/starburst)
