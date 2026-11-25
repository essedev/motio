# @motiojs/noise

Seeded simplex noise for [Motio](https://motio.esse.dev): values that change smoothly with their coordinates, the same for the same seed in every render. Built on the `simplex-noise` package.

```bash
pnpm add @motiojs/noise
```

## Drift with noise

<!-- example: ../../docs/guide/examples/src/packages/noise.tsx#noise -->
```tsx
import { AbsoluteFill, useCurrentFrame } from "@motiojs/motio";
import { noise2D } from "@motiojs/noise";

// A grid of dots, each drifting smoothly along its own noise field.
export const Drift = () => {
	const frame = useCurrentFrame();
	const dots = [];
	for (let y = 0; y < 9; y++) {
		for (let x = 0; x < 16; x++) {
			const dx = noise2D("x", x / 5, frame / 30 + y / 5) * 14;
			const dy = noise2D("y", y / 5, frame / 30 + x / 5) * 14;
			dots.push(
				<div
					key={`${x}-${y}`}
					style={{
						position: "absolute",
						left: 20 + x * 38 + dx,
						top: 20 + y * 38 + dy,
						width: 12,
						height: 12,
						borderRadius: 6,
						background: "#0ea5e9",
					}}
				/>,
			);
		}
	}
	return <AbsoluteFill style={{ backgroundColor: "#082f49" }}>{dots}</AbsoluteFill>;
};
```

## Exports

| Export | What it does |
|---|---|
| `noise2D(seed, x, y)` | 2D simplex noise, a value in [-1, 1]. |
| `noise3D(seed, x, y, z)` | 3D simplex noise. |
| `noise4D(seed, x, y, z, w)` | 4D simplex noise. |

The seed is a string or a number (`NoiseSeed`). Use a time coordinate such as `frame / 30` to animate.

## Compatibility

The compat alias maps `@remotion/noise` here; the outputs equal Remotion's for the same seed and coordinates.

Documentation: [motio.esse.dev/reference/packages/noise](https://motio.esse.dev/reference/packages/noise/) · Source: [packages/noise](https://github.com/essedev/motio/tree/main/packages/noise)
