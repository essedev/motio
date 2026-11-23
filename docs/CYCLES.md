# Cycles

Progress log, newest first. One entry per unit of work: what changed, what was measured, what is next.

## 2026-11-23: M3 closed, templates, motio dev

- M3 done: `@motiojs/media` (D-029), media service, audio pass, muxing and audio codecs (D-030), the Player's media playback, `motio dev` with a render check (D-026); 907 tests green in `make check`.
- Official templates fetched at pinned commits and rendered unmodified (D-025): Blank, Hello World JS, Still and Overlay build with Remotion's metadata; two stills differ only at transparent edges of scaled layers (D-031, open).
- Google Fonts now fetch the same files as Remotion (D-027); mono audio upmix corrected against the oracle (D-028).
- Next: core API gaps for the Hello World template; BeginFrame on Linux, remaining codecs and chunked rendering (M2, M5).

## 2026-11-23: M1 closed, M2 and M3 largely in place

- M1 done (D-024): core timeline and page runtime, renderer, bundler, compat, CLI, testing utilities; every criterion backed by a committed test, `make check` green (705 tests including integration), clean build and render inside the pinned Linux image.
- End-of-milestone adversarial review: six defects found and fixed with tests.
- Delivered ahead of order: transitions, captions, shapes, paths, noise, layout-utils, zod-types, google-fonts, fonts, media-utils, the Player, the audio mixer, video frame extraction, chunk assembly; measured recipes for alpha and GIF output.
- Next: the media components and audio pass (M3), BeginFrame and the official templates (M2), chunk output and workers (M5).

## 2026-11-22: oracle recordings and early M2/M3 pieces

- Reference recordings from the published Remotion (pinned, run locally, public API only): stills for the M1 fixture compositions and the M2 feature fixtures, source-frame sequences and click positions for media, zod-types acceptance, layout-utils outputs in Chrome 158.
- Pinned Linux image (`docker/`); BeginFrame measured 3.8 times faster than screenshots on Linux with identical pixels (D-013).
- `@motiojs/audio` (D-014), `@motiojs/video-frames` (D-015), native video seeking design (D-016), `@motiojs/zod-types`, `@motiojs/layout-utils`: each equal to the recordings, or with documented and measured divergences.

## 2026-11-22: planning, spike, M1 start

- Architecture revised after an adversarial review: compatibility target pinned (remotion@4.0.545), frame model as the default time model, explicit settle loop, colour pipeline, legal hygiene, milestone order (D-005 to D-012).
- Spike: time model measured on eight fixtures in five orders; capture throughput per format, resolution and concurrency (D-005, D-006, D-007).
- Monorepo scaffolded (pnpm, TypeScript 7, Biome, Vitest unit and integration projects), page-renderer protocol contract in `@motiojs/core/protocol`.
- M1 started in parallel: core pure functions with the oracle, renderer and testing utilities, bundler, compat and CLI.
