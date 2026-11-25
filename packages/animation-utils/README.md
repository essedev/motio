# @motiojs/animation-utils

Helpers for animating CSS in a [Motio](https://motio.esse.dev) video: builders that write CSS transform functions, `makeTransform()` to join them, and `interpolateStyles()` to interpolate whole style objects between keyframes.

```bash
pnpm add @motiojs/animation-utils
```

<!-- example: ../../docs/guide/examples/src/packages/animation-utils.tsx#card -->
```tsx
import { interpolateStyles, makeTransform, rotate, translate } from "@motiojs/animation-utils";
import { AbsoluteFill, useCurrentFrame } from "@motiojs/motio";

export const Card = () => {
	const frame = useCurrentFrame();
	// Fades in, rises 40 px and straightens over the first 20 frames, then holds.
	const style = interpolateStyles(
		frame,
		[0, 20],
		[
			{ opacity: 0, transform: makeTransform([translate(0, 40), rotate(-4)]) },
			{ opacity: 1, transform: makeTransform([translate(0, 0), rotate(0)]) },
		],
		{ extrapolateRight: "clamp" },
	);
	return (
		<AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
			<div style={{ ...style, padding: 48, background: "white", fontSize: 64 }}>Hello</div>
		</AbsoluteFill>
	);
};
```

| Export | What it does |
|---|---|
| `translate()`, `translateX/Y/Z()`, `translate3d()` | A translation: numbers are pixels, or pass a unit (`translate(10, "%")` is `"translate(10%)"`) or a length string. |
| `rotate()`, `rotateX/Y/Z()`, `rotate3d()`, `skew()`, `skewX/Y()` | An angle transform: numbers are degrees (`rotate(45)` is `"rotate(45deg)"`), or pass a unit or an angle string. |
| `scale()`, `scaleX/Y/Z()`, `scale3d()`, `perspective()`, `matrix()`, `matrix3d()` | The other CSS transform functions. |
| `makeTransform(transforms)` | Joins transform functions into one `transform` value, separated by spaces. |
| `interpolateStyles(input, inputRange, outputStylesRange, options?)` | Interpolates between style objects with the options of `interpolate()`: numbers, lengths with matching units, colors, and transform and filter functions with numeric arguments. Other words must be equal on both sides. |

## Compatibility

The compat alias maps `@remotion/animation-utils` here. The builders and `interpolateStyles()` give the same results as the published package on a recorded set of 18,418 builder calls and 10,566 `interpolateStyles` calls, including its validation rules for unit strings.

Documentation: [motio.esse.dev/reference/packages/animation-utils](https://motio.esse.dev/reference/packages/animation-utils/) · Source: [packages/animation-utils](https://github.com/essedev/motio/tree/main/packages/animation-utils)
