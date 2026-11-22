# Compatibility: @motiojs/shapes

Target: `@remotion/shapes@4.0.545`. Proof: `src/__oracle__/make.json` (150 generated option sets per `makeX()` function, invalid values included) and `src/__oracle__/components.json` (static markup of every component), recorded by `tools/oracle-features` (`pnpm record shapes`).

| Export | Status | Tolerance |
|---|---|---|
| `makeRect`, `makeCircle`, `makeEllipse`, `makePie`, `makeTriangle`, `makeHeart`, `makeArrow`, `makeCallout`, `makeSpark` | within tolerance | 1e-12 relative (measured max 4.3e-14), identical errors |
| `makePolygon`, `makeStar` | within tolerance, with an edge case | 1e-10 relative (measured max 8.5e-12); see below |
| `Rect`, `Circle`, `Ellipse`, `Pie`, `Triangle`, `Polygon`, `Star`, `Heart`, `Arrow`, `Callout`, `Spark` | within tolerance | identical markup, numbers as above |
| `debug` overlay | exact | same elements and attributes |
| `ShapeInfo`, `MakeXProps`, `XProps` (types) | exact | n/a |
| `<Sequence>` props on components (`from`, `durationInFrames`, ...) | supported | wraps the svg in Motio's `<Sequence layout="none">`, so it must render inside a composition |
| `effects`, `effectsOutputSize`, `pixelDensity` | missing | a non-empty `effects` throws with a clear message |

Polygons and stars are moved so their bounding box starts at (0, 0). Remotion computes that box with a method that overshoots when `edgeRoundness` is very close to zero (the curves degenerate into lines): at exactly 0 its box is about 4% of the radius too large, and at 1e-4 the difference is still 4e-9. Motio's box is exact, so those shapes are placed slightly differently. Visually this only matters at exactly `edgeRoundness: 0`, where Remotion leaves a margin and Motio does not.

Differences in the last bits (up to 4.3e-14 relative) come from a different order of floating-point operations in a few formulas; they are invisible.
