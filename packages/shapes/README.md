# @motiojs/shapes

SVG shapes for [Motio](https://motio.esse.dev): a component that renders each shape in an `<svg>`, and a `make...()` function that returns its path for an SVG of your own.

```bash
pnpm add @motiojs/shapes
```

## Animated shapes

<!-- example: ../../docs/guide/examples/src/packages/shapes.tsx#shapes -->
```tsx
import { AbsoluteFill, interpolate, useCurrentFrame } from "@motiojs/motio";
import { Pie, Star, Triangle } from "@motiojs/shapes";

// A pie that fills over 60 frames, a triangle with rounded corners and a five-pointed star.
export const Shapes = () => {
	const frame = useCurrentFrame();
	const progress = interpolate(frame, [0, 59], [0, 1]);
	return (
		<AbsoluteFill style={{ flexDirection: "row", gap: 20, alignItems: "center" }}>
			<Pie radius={50} progress={progress} fill="#fb923c" closePath />
			<Triangle length={100} direction="up" fill="#34d399" cornerRadius={8} />
			<Star points={5} innerRadius={25} outerRadius={50} fill="#facc15" />
		</AbsoluteFill>
	);
};
```

## Exports

- Components: `<Arrow>`, `<Callout>`, `<Circle>`, `<Ellipse>`, `<Heart>`, `<Pie>`, `<Polygon>`, `<Rect>`, `<Spark>`, `<Star>`, `<Triangle>`. Besides the shape's own options they take the props of an SVG `<path>` (`fill`, `stroke`, ...), `style` for the `<svg>`, `pathStyle` for the `<path>` and `debug`, which draws the Bézier control points.
- Functions: `makeArrow()`, `makeCallout()`, `makeCircle()`, `makeEllipse()`, `makeHeart()`, `makePie()`, `makePolygon()`, `makeRect()`, `makeSpark()`, `makeStar()`, `makeTriangle()`. Each returns a `ShapeInfo`: the SVG `path`, the same path as `instructions` for [`@motiojs/paths`](https://motio.esse.dev/reference/packages/paths/), the `width` and `height` for a `viewBox`, and the `transformOrigin` to rotate the shape around itself.

Where a shape has both, `cornerRadius` and `edgeRoundness` cannot be combined.

## Compatibility

The compat alias maps `@remotion/shapes` here. The `effects` prop is not supported: a non-empty array throws.

Documentation: [motio.esse.dev/reference/packages/shapes](https://motio.esse.dev/reference/packages/shapes/) · Source: [packages/shapes](https://github.com/essedev/motio/tree/main/packages/shapes)
