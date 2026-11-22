# Cycles

Progress log, newest first. One entry per unit of work: what changed, what was measured, what is next.

## 2026-11-22: oracle recordings and early M2/M3 pieces

- Reference recordings from the published Remotion (pinned, run locally, public API only): stills for the M1 fixture compositions and the M2 feature fixtures, source-frame sequences and click positions for media, zod-types acceptance, layout-utils outputs in Chrome 158.
- Pinned Linux image (`docker/`); BeginFrame measured 3.8 times faster than screenshots on Linux with identical pixels (D-013).
- `@motiojs/audio` (D-014), `@motiojs/video-frames` (D-015), native video seeking design (D-016), `@motiojs/zod-types`, `@motiojs/layout-utils`: each equal to the recordings, or with documented and measured divergences.

## 2026-11-22: planning, spike, M1 start

- Architecture revised after an adversarial review: compatibility target pinned (remotion@4.0.545), frame model as the default time model, explicit settle loop, colour pipeline, legal hygiene, milestone order (D-005 to D-012).
- Spike: time model measured on eight fixtures in five orders; capture throughput per format, resolution and concurrency (D-005, D-006, D-007).
- Monorepo scaffolded (pnpm, TypeScript 7, Biome, Vitest unit and integration projects), page-renderer protocol contract in `@motiojs/core/protocol`.
- M1 started in parallel: core pure functions with the oracle, renderer and testing utilities, bundler, compat and CLI.
