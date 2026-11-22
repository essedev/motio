# Cycles

Progress log, newest first. One entry per unit of work: what changed, what was measured, what is next.

## 2026-11-22: planning, spike, M1 start

- Architecture revised after an adversarial review: compatibility target pinned (remotion@4.0.545), frame model as the default time model, explicit settle loop, colour pipeline, legal hygiene, milestone order (D-005 to D-012).
- Spike: time model measured on eight fixtures in five orders; capture throughput per format, resolution and concurrency (D-005, D-006, D-007).
- Monorepo scaffolded (pnpm, TypeScript 7, Biome, Vitest unit and integration projects), page-renderer protocol contract in `@motiojs/core/protocol`.
- M1 started in parallel: core pure functions with the oracle, renderer and testing utilities, bundler, compat and CLI.
