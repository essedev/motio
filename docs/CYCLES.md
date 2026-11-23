# Cycles

Progress log, newest first. One entry per unit of work: what changed, what was measured, what is next.

## 2026-11-23: second review, legal hygiene, Tier 2 and Tier 3 packages

- Second adversarial review (M2, M3, performance): ten defects confirmed and fixed with tests, among them overlapping copies of one audio source split into one-frame segments, unbounded audio decoding, an uncaught EPIPE, and opaque captures that were white where Remotion's are black (D-050); FFmpeg minimum raised to 5.1 (D-051).
- Legal hygiene: Remotion's renders of its own templates are no longer committed (recorded locally into the ignored cache); `motio` reports its own `VERSION`, with Remotion's API version only through the `remotion` alias; every error message reworded in Motio's own terms, oracle tests compare behaviour instead of text (D-054).
- New packages: lottie, gif (D-052, D-053), starburst (D-055), light-leaks (approximated, D-056), the twelve HTML-in-canvas transitions and `HtmlInCanvasMotionBlur` (D-058 to D-060). `@remotion/effects` needs an effect pipeline in core (D-057).
- `make check` green with 1406 tests. Next: Rive, Skia and transcription adapters; then what needs the author (M4 project, cloud spending, D-009 confirmation, history rewrite before publishing).

## 2026-11-23: performance criterion met

- Committed benchmark against the pinned Remotion (`make bench`, D-044). Profiled the full pipeline: FFmpeg probed the image pipe until stdin closed, Chrome throttled captures to its frame rate, SwiftShader composited every frame on the CPU, the exact JPEG colour path halved x264's speed.
- Fixed with measurements (D-040 to D-043): no probe, unthrottled frames, software compositing for opaque captures and CPU raster for transparent ones, JPEG colour converted in YUV, browsers shared by pages (two by default), screenshots instead of BeginFrame on Linux. Motio now renders the benchmark in 0.27 to 0.83 of Remotion's time on macOS and 0.28 to 0.68 in the pinned image.
- Side effect: every template still and `fixtures/compositions` golden is identical to Remotion's render; the transparent-edge mismatch (D-031, D-038) is closed.
- Next: M2's manifest statuses, the TikTok and Three templates' packages, the Lambda adapter (M5).

## 2026-11-23: M2 closed, performance criterion met

- Performance (D-040 to D-044): FFmpeg starts encoding with the first frame, software compositing for opaque captures, BT.709 conversion in YUV, pages sharing two browsers; Motio renders the 1080p benchmark in 0.27 to 0.83 of Remotion's time (`make bench --assert`).
- Every Tier 1 symbol supported or stubbed (D-045); `@motiojs/three`, `@motiojs/animation-utils`, `@motiojs/motion-blur` (D-046 to D-048).
- All seven official templates build unmodified and match Remotion's stills; `fixtures/features` compared in full; M2 closed (D-{n:03d}).
- Next, needing the author: M4 on a real production project, cloud spending for the Lambda and Cloud Run adapters, D-009 confirmation, publishing.

## 2026-11-23: BeginFrame, codecs, chunked rendering, performance baseline

- BeginFrame capture on Linux with a start-up probe (D-033); every documented codec but AV1, with alpha and GIF (D-037); chunked rendering with local workers, frame-exact for lossless codecs and without dropped or duplicated frames for H.264 (D-039).
- Core gaps closed (`Interactive`, `Easing.spring`, non-numeric `interpolate` outputs): the official Hello World template builds and renders.
- Head-to-head with Remotion on 1080p fixtures: Motio 1.6 to 3 times slower with screenshot capture; causes measured and a performance criterion added (D-032). Performance work in progress.
- Next: meet the performance criterion; the transparent-edge mismatch (D-031, D-038).

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
