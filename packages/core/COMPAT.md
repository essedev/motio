# Compatibility with Remotion

How the pure functions of `@motiojs/core` compare with the published `remotion` package. Every row is checked by the co-located tests against fixtures recorded from Remotion's public API by `tools/oracle` (`pnpm install && pnpm record` there), never from its source code.

Recorded version: **remotion 4.0.545** (stamped in every fixture under `src/__oracle__/`).

Error is relative for values with magnitude at least 1 and absolute below.

| Function            | Status           | Test tolerance   | Measured max error          | Oracle coverage                                                                                                                                                                                                                                         |
| ------------------- | ---------------- | ---------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `random`            | exact            | bit-identical    | 0                           | 3817 number seeds (integers, fractions, huge, `-0`, `NaN`, infinities), 2770 string seeds (ASCII, BMP, surrogate pairs, lone surrogates), invalid seeds                                                                                                 |
| `interpolate`       | within tolerance | 1e-12            | 1.0e-15 (99% bit-identical) | 31038 values: 12 range shapes x 16 extrapolation pairs, easing x extrapolation, per-segment easing arrays, `posterize`, non-finite inputs, 24 validation messages                                                                                       |
| `Easing`            | within tolerance | 1e-12            | 1.4e-14                     | 19597 values: every curve and `in`/`out`/`inOut` of each, `poly`, `elastic`, `back` with and without arguments, 53 beziers, `step0`/`step1`, t outside [0, 1], bezier validation                                                                        |
| `Easing.spring`     | within tolerance | 1e-12            | 1.0e-15 (78% bit-identical) | 6261 values: 67 configs (damping, mass, stiffness, `overshootClamping`, `durationRestThreshold`, `allowTail` including non-boolean values), t over [-0.25, 2] plus 0, 1, 1 +- 1e-9, +-Infinity; validation errors on first use; 2 configs where Remotion never returns |
| `interpolateColors` | exact            | identical string | 0                           | 3836 outputs: hex 3/4/6/8, rgb/rgba, hsl/hsla, all 148 named colors and `transparent`, oklch/oklab/lab/lch/hwb (1250 random colors) and 250 random hsl, easing, `posterize`, multi-stop ranges; 56 accepted/rejected strings; 24 edge and error cases   |
| `spring`            | within tolerance | 1e-12            | 5.9e-15                     | 51060 frames: 240 physical configs (under and overdamped, `overshootClamping`), `from`/`to`, fps 24/25/29.97/30/60, `durationInFrames`, `durationRestThreshold`, `delay`, `reverse`, negative and fractional frames, 16 validation and degenerate cases |
| `measureSpring`     | exact            | identical number | 0                           | 2898 cases: config grid x fps x threshold, deprecated `from`/`to`, validation messages                                                                                                                                                                  |

No function is approximated.

## Behaviour identified black-box

These are the places where the docs alone did not determine the numbers; each was found by testing hypotheses against the recordings.

- `random`: a number seed is multiplied by 1e10 and a string seed is hashed with the Java-style hash (h = 31 h + c over UTF-16 code units); the result is the state of one mulberry32 step, divided by 2^32. `NaN` and infinite seeds give 0.
- `Easing`: `bezier`, `ease`, `circle` and `bounce` clamp t to [0, 1]; the other curves extrapolate their formula.
- `spring`: for a damping ratio of 1 or more, the critically damped response is used (as if the ratio were exactly 1), not the overdamped solution. With `durationInFrames`, frames past the duration return exactly `to`. Frames before the start hold the value at time 0.
- `Easing.spring`: for 0 < t < 1 it is `spring({ frame: t * 30, fps: 30, durationInFrames: 30, durationRestThreshold })`; t <= 0 gives 0 and t >= 1 gives 1. With a truthy `allowTail`, t >= 1 gives `spring({ frame: t * d, fps: 30 })` with d the natural duration (`measureSpring()` at the threshold). The function's `remotionShouldExtendRight` is the `allowTail` value (default `false`). The configuration is validated on the first evaluation that needs the spring, not when the easing is created.
- `measureSpring`: the first frame within the threshold that stays within it for the next 18 frames. `overshootClamping` is ignored. A `NaN` position (mass <= 0, negative stiffness) counts as settled.
- `interpolateColors`: colors are quantised to 8-bit RGBA before interpolating (alpha included, so `0.3` reads back as `0.302`), channels are interpolated with `clamp` whatever the options say, and the output rounds channels and gives alpha to 3 decimals. `lab()` and `lch()` use the D65 white (0.95047, 1, 1.08883) with no Bradford adaptation and the 7-digit XYZ to sRGB matrix; out-of-gamut colors are clipped per channel.

## Deliberate differences

- `Easing.spring` with `stiffness: 0` or `durationRestThreshold: 0` throws on first use. Remotion never returns (and later `Easing.spring` calls in the same page fail with `RangeError: Too many properties to enumerate`).
- `measureSpring` (and `spring` with `durationInFrames` or `reverse`) with `stiffness: 0` and a threshold below 1 throws `Spring stiffness must be greater than 0, ...`. Remotion never returns in that case.

## Not implemented yet

Parts of the 4.0.545 API outside the current scope:

- `interpolate`: `output: "perceptual-scale"`, `outputType`, CSS transform strings (`scale`, `translate`, `rotate`, `transform-origin`), numeric tuples, boolean and discrete string outputs.
- `interpolateColors`: none of the documented formats is missing; `color()` and space-separated `rgb()`/`hsl()` are rejected, as in Remotion.
