# Compatibility: @motiojs/noise

Target: `@remotion/noise@4.0.545`. Proof: `src/__oracle__/noise.json`, recorded by `tools/oracle-features` (`pnpm record noise`).

| Export | Status | Tolerance |
|---|---|---|
| `noise2D` | exact | bit-identical |
| `noise3D` | exact | bit-identical |
| `noise4D` | exact | bit-identical |

Built on `simplex-noise@4.0.1` (MIT), the dependency Remotion documents. The seed becomes the constant that simplex-noise's permutation builder draws from: `random(seed)` for 2D, `random(random(seed))` for 3D and 4D, where `random` is `@motiojs/core`'s Remotion-compatible `random()`.
