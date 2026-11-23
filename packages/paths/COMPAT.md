# Compatibility: @motiojs/paths

Target: `@remotion/paths@4.0.545`. Proof: the fixtures in `src/__oracle__/`, recorded by `tools/oracle-features` (`pnpm record paths`) on generated paths (every command in absolute and relative form, arcs with zero, scaled-up and large radii, closes in the middle, paths without an initial move) and on raw strings for the parser.

| Export | Status | Tolerance |
|---|---|---|
| `parsePath` | exact | identical instructions; fails on the same strings |
| `serializeInstructions` | exact | identical strings |
| `normalizePath`, `reduceInstructions` | exact | bit-identical |
| `getLength`, `getPointAtLength`, `getTangentAtLength`, `getInstructionIndexAtLength` | exact | bit-identical; fails on the same inputs |
| `cutPath` | within tolerance | 1e-12 relative (measured max 8e-15) |
| `evolvePath` | exact | bit-identical |
| `reversePath`, `translatePath`, `scalePath`, `resetPath`, `centerPath`, `getSubpaths` | exact | bit-identical |
| `getBoundingBox` | exact | bit-identical |
| `extendViewBox` | exact | identical strings; fails on the same viewBoxes |
| `warpPath` | exact | bit-identical |
| `interpolatePath`, `interpolatePaths` | exact, with an edge case | see below |
| `Instruction`, `ReducedInstruction`, `BoundingBox`, `WarpPathFn` (types) | exact | n/a |

Failures are compared on behaviour, not wording: the same inputs throw, with the same error class (`Error` or `TypeError`), and Motio's message names the same option. The messages are Motio's own and say what to fix (D-054).

`cutPath` searches the curve parameter of the cut iteratively; in rare cases its input differs from Remotion's in the last bit, which moves the result by at most 8e-15 relative on the recorded cases.

`interpolatePath` and `interpolatePaths` are identical on every recorded pair except when a drawing command follows a close with no move in between, or a path does not start with a move (about 3% of the generated pairs). There Remotion sometimes fails with a `TypeError` or another error where Motio interpolates or fails differently; well-formed paths are not affected.

Reproduced on purpose because Remotion does it: a path that starts with a smooth curve (`S`, `s`, `T`, `t`) fails to measure with a `TypeError`; `getInstructionIndexAtLength` returns the index of the previous instruction; zero-radius arcs are measured as a straight line walked by angle; instructions before the first move are dropped by `cutPath`, `reversePath` and `getSubpaths`.

Third-party code (MIT, ISC or BSD licensed, headers kept in the files): svg-path-properties (measurement), svgpath (arc to cubic conversion), svg-path-bbox (curve extrema), d3-interpolate-path (point matching), WarpJS (subdivision). See `NOTICE`.
