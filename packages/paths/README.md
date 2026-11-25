# @motiojs/paths

SVG path utilities for [Motio](https://motio.esse.dev): measure, draw, morph, cut and transform the `d` strings of SVG paths.

```bash
pnpm add @motiojs/paths
```

## Draw and morph a path

<!-- example: ../../docs/guide/examples/src/packages/paths.tsx#paths -->
```tsx
import { AbsoluteFill, interpolate, useCurrentFrame } from "@motiojs/motio";
import { evolvePath, interpolatePath } from "@motiojs/paths";

const A = "M 50 180 C 120 40, 240 40, 300 180 S 480 320, 590 180";
const B = "M 50 120 C 150 300, 250 300, 320 120 S 500 -60, 590 220";

// One curve drawn progressively with evolvePath(), another morphing from A to B.
export const Paths = () => {
	const frame = useCurrentFrame();
	const progress = interpolate(frame, [0, 59], [0, 1]);
	const evolved = evolvePath(progress, A);
	return (
		<AbsoluteFill>
			<svg width={640} height={360} viewBox="0 0 640 360" aria-hidden="true">
				<path
					d={A}
					fill="none"
					stroke="#1e3a8a"
					strokeWidth={10}
					strokeDasharray={evolved.strokeDasharray}
					strokeDashoffset={evolved.strokeDashoffset}
				/>
				<path d={interpolatePath(progress, A, B)} fill="none" stroke="#b91c1c" strokeWidth={4} />
			</svg>
		</AbsoluteFill>
	);
};
```

## Exports

- Animate: `evolvePath()` (stroke dash values that draw a path progressively), `interpolatePath()` (between two paths), `interpolatePaths()` (across keyframes, with the input range, easing and extrapolation rules of `interpolate()`).
- Measure: `getLength()`, `getPointAtLength()`, `getTangentAtLength()`, `getInstructionIndexAtLength()`, `getBoundingBox()`.
- Transform: `translatePath()`, `scalePath()`, `warpPath()`, `reversePath()`, `resetPath()`, `centerPath()`, `cutPath()`, `extendViewBox()`, `getSubpaths()`.
- Parse and write: `parsePath()`, `normalizePath()`, `reduceInstructions()`, `serializeInstructions()`, and the `Instruction` types.

The shape generators of [`@motiojs/shapes`](https://motio.esse.dev/reference/packages/shapes/) and `makeTextBackground()` of `@motiojs/text` return their paths as instructions for these functions.

## Compatibility

The compat alias maps `@remotion/paths` here. Some functions are ported from MIT and BSD-licensed projects (svg-path-properties, svgpath, svg-path-bbox, d3-interpolate-path, WarpJS); each ported file keeps its notice, listed in [NOTICE](https://github.com/essedev/motio/blob/main/packages/paths/NOTICE).

Documentation: [motio.esse.dev/reference/packages/paths](https://motio.esse.dev/reference/packages/paths/) · Guide: [Fonts and text](https://motio.esse.dev/guide/fonts-and-text/) · Source: [packages/paths](https://github.com/essedev/motio/tree/main/packages/paths)
