# Decisions

Each entry: the decision, why, and what would make us revisit it. Newest last.

## D-001 Licence: Apache-2.0 (2026-11-22)

Matches the code we may port (HyperFrames) and adds a patent grant. MIT would not change the licence of ported Apache code anyway.

## D-002 FFmpeg is a system dependency (2026-11-22)

The engine runs the `ffmpeg` and `ffprobe` found on `PATH` (or configured) as separate processes; `doctor` and every render check the minimum version and the encoders the output needs, and the render metadata records the version. No binary on npm: common static builds are GPL because of x264, and `libfdk_aac` cannot be redistributed. Reproducibility comes from the official container image, which pins one build. Revisit if installation friction proves to be the main adoption barrier: a pinned download can be added as an opt-in package.

## D-003 Vite bundles user projects (2026-11-22)

One tool for the dev page and the render bundle, a plugin API that fits the compat alias, the standard in the React ecosystem. Remotion's `webpackOverride` has no equivalent; the migration guide maps the common overrides and `doctor` flags projects that define one.

## D-004 Name: Motio (2026-11-22)

Entry package `motio`, CLI `motio`, other packages under `@motiojs/*` because the `@motio` npm scope belongs to an existing organisation.

## D-005 Time model: frame model by default, virtual clock opt-in (2026-11-22)

The spike rendered eight fixtures (frame-driven, state set in an effect, CSS keyframes, Web Animations, a `requestAnimationFrame` canvas loop, a `setInterval` counter, `Math.random` and `Date.now` in render) over 60 frames in five orders: sequential twice, reverse, shuffled, and a fresh page per frame. Agreement with the fresh page, out of 60 frames:

| Fixture | No shim | No shim + animation seek | Shim + animation seek |
|---|---|---|---|
| Frame-driven | 60 | 60 | 60 |
| State set in effect | 60 | 60 | 60 |
| CSS keyframes | 0 | 60 | 60 |
| Web Animations | 0 | 60 | 60 |
| rAF + `performance.now` | 0 | 0 | 60 |
| `setInterval` counter | 2 | 2 | 1 to 60, order dependent |
| `Math.random` | 0 | 0 | 60 |
| `Date.now` | 0 | 0 | 60 |

Conclusions:
- `flushSync` plus the passive effects of a sync render are enough for effect-driven state; the shim did not disturb React in these fixtures.
- Seeking `document.getAnimations()` makes CSS and Web Animations deterministic without any clock patching, so it is on in both models.
- The shim fixes stateless clock reads in any order, but state accumulated by timers depends on where the page started, which contradicts "any frame, any order".

So the default is Remotion's model (the frame is the only source of truth, no clock patched, any order), plus animation seeking. The virtual clock is opt-in for third-party libraries that read the clock, with contiguous ascending ranges per page. This keeps the default as safe as Remotion and takes the shim off the critical path. The adversarial review reached the same recommendation independently. Revisit if a large share of real projects need the virtual model.

## D-006 Capture: screenshot path, JPEG 80 by default (2026-11-22)

On an Apple M5, chrome-headless-shell 158, software GL, the spike measured per page: `seek` 4.5 ms; `Page.captureScreenshot` about 49 to 64 ms per frame whether PNG, JPEG 90 or JPEG 80, at 720p or 1080p; piping to libx264 (`veryfast`, CRF 18) adds almost nothing. Capture latency, not encoding or format, bounds a single page, so throughput comes from concurrency (see D-007 for the measurement) and, on Linux, from BeginFrame, to be measured in the container in M1. JPEG 80 stays the default for opaque output for parity with Remotion; PNG for alpha and lossless.

## D-008 Compatibility target: remotion@4.0.545 (2026-11-22)

The latest published version when work started. Every compatibility claim and oracle recording refers to it; moving it is an explicit change that re-records the oracle.

## D-009 Oracle recordings are made by the author as an individual (2026-11-22)

Recording reference values and frames means running Remotion. Remotion's licence is free for individuals; recordings made for a company would need a company licence. The recordings are produced by the project author as an individual for this personal open-source project, at the pinned version, with the oracle installed outside the workspace. To be confirmed explicitly by the author.

## D-010 Kinetograph: ideas only (2026-11-22)

Its licence could not be verified and its easing code has unattributed provenance, so no code is ported from it. Easing and the other pure functions are written from public formulas and checked against the oracle.

## D-011 Milestone order: compat breadth before the production project (2026-11-22)

A real production project almost certainly uses transitions, Google Fonts, Zod and Tailwind, so the breadth milestone comes before it. Media and the Player come after breadth because the first renders and templates are mostly graphics.

## D-012 Tooling (2026-11-22)

- `tsc -b` with project references builds and type-checks every package: libraries emit ESM with declarations and need no bundling, and references enforce package boundaries. Revisit with tsdown if a package needs bundling.
- Biome for lint and format, Vitest for tests (Node, jsdom and a serial integration project with the real Chrome and FFmpeg), Playwright only for the Player.
- TypeScript 7 (native compiler), pnpm workspaces, ESM-only, Node 22 or later.
