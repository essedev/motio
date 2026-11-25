# Roadmap

A milestone is done only when every criterion below holds and `make check` is green. Thresholds are part of the contract: changing one is a decision recorded in `DECISIONS.md`.

## Current state

M1 (D-024), M2 (D-049), M3, performance (D-044) and M6 (D-066) are done; a second adversarial review's ten findings are fixed (D-050, D-051). Since D-066 work is chosen by what makes Motio complete on its own, not by the gap with Remotion: compatibility is pinned at the 4.0.545 API, guarded by the existing tests and updated on a schedule. Brand chosen (D-077), website built (D-079), promotional material made with Motio (D-080). In progress: M4 on Remocn and snapcn (D-088 to D-091, below). Waiting on the author: the cloud adapters of M5 (a use case and approved spending) and the publishing steps in `BACKLOG.md`.

- Packages beyond Tier 1, each checked against the published package's oracle and rendered stills: `@motiojs/three`, `@motiojs/animation-utils`, `@motiojs/motion-blur`, `@motiojs/starburst` (D-046 to D-048, D-055, D-059), `@motiojs/light-leaks` (its own pattern, approximated, D-056), `@motiojs/lottie`, `@motiojs/gif`, `@motiojs/rive` (D-052, D-053, D-061), the twelve HTML-in-canvas transitions (D-058) and the transcription packages (D-062). Dropped from the plan (D-066): `<ThreeWebGPUCanvas>`, `@remotion/effects`, Skia (assessed in D-063), whisper-web, client-side rendering and the other Tier 3 packages.

## Spike (done)

- [x] Time model measured on eight fixtures in five orders (D-005).
- [x] Capture throughput per format and resolution (D-006).
- [x] Capture throughput against concurrency (D-007).
- [x] BeginFrame against screenshot in the Linux image (D-013).
- Moved into M1 as integration tests: frame stamps, React fixtures, colour round trip.

## M1: single-node render (done, D-024)

Scope: core timeline and components (`Composition`, `Still`, `Folder`, `Sequence` with the full prop set of the target, `Series`, `Loop`, `Freeze`, `AbsoluteFill`, `registerRoot`, `getInputProps`, `calculateMetadata`, readiness), the pure functions, the page runtime and frame protocol, the Vite bundler with the compat alias, the renderer (browser ensure, page pool, screenshot capture, H.264 MP4 encoder with explicit colour), the CLI (`render`, `still`, `compositions`, `frames`, `check determinism`, `check flicker`, `browser ensure`, `--json`).

Done when:
- Pure functions equal the oracle: strings and integers exact, floats within 1e-9 relative, or listed as approximated in `packages/core/COMPAT.md` with the measured error.
- Frame stamps: zero mismatches over 3,000 frames at concurrency 1, 4 and 8 in random order.
- React fixtures pass: `delayRender` in an effect, `setState` in an effect, `useDeferredValue`, lazy plus `Suspense`.
- Determinism: every frame of every run has the decoded hash of a reference rendered with a new page per frame (D-074; until then runs were only compared with each other, which missed D-072). Runs: descending at concurrency 1, ascending and random at concurrency 1, 4 and 8. Image formats: PNG and JPEG. Compositions: ones that move below Blink's raster tolerance (a settling spring, scale from 0, steps below 1e-4, subpixel translation, `will-change: transform`). In the pinned image the BeginFrame path is held to the same reference at concurrency 1.
- Colour: palette round trip within 2 code values; `ffprobe` shows bt709 and tv range, the exact frame count and fps.
- Oracle stills: the fixture compositions match Remotion's render of the same code with mean SSIM at least 0.99 and PSNR at least 40 dB, worst frame SSIM at least 0.97, on each capture path: PNG stills against Remotion's PNG stills, and JPEG stills (the default video capture) against Remotion's JPEG stills (D-050).
- Errors: a readiness timeout reports its code, label and frame; every `--json` output validates against its schema.

## M2: compatibility breadth (done, D-049)

Scope: BeginFrame capture on Linux (D-013), `Img`, fonts, Google Fonts, Tailwind, `remotion.config.ts` and `Config`, env vars, static files, transitions, captions, Zod schemas, shapes, paths, noise, layout utils; the symbol manifest and `doctor`.

Done when:
- Every Tier 1 symbol in the manifest is supported with a test or stubbed with a build-time message.
- `fixtures/features` (every transition presentation, shapes, paths, noise) matches its Remotion reference stills within the M1 SSIM thresholds.
- Caption parsing equals the oracle output.
- Three official Remotion templates (fetched at test time, not vendored) build through the alias with zero edits and render within the M1 thresholds.

## M3: media and Player (done)

Scope: `Video`, `OffthreadVideo`, `Audio`, `@remotion/media`, the audio pass and mixer, the Player, `motio dev`.

Done when:
- Video: every video composition of `fixtures/media` (frame-stamped sources at 24, 30, 59.94 and 60 fps, `playbackRate` 2, trim, HTML5 `Video`, `@remotion/media` `Video`) shows exactly the source-frame sequence in `fixtures/media/__golden__/remotion/media.json`. The selection rule differs per component (`OffthreadVideo` rounds down, the HTML5 `Video` rounds to nearest).
- Audio: click times of the audio compositions within 1 ms of `media.json` and click peaks within 0.01 (offset and volume ramp; the time-stretched `playbackRate` 2 case within 2 ms), no seams.
- Player: real-browser tests (puppeteer-core in the pinned chrome-headless-shell, D-022) cover the ref API and events.

## Performance (cross-cutting, done)

Checked by `make bench BENCH_ARGS="--assert"`, outside `make check` (it needs the pinned Remotion and takes minutes). Done when a committed benchmark renders the `fixtures/compositions` motion and timeline compositions at 1920x1080 with Motio and with the pinned Remotion on the same machine, and Motio's wall time is at most Remotion's at concurrency 1, 4 and 8, with the colour and determinism criteria of M1 still met. Measured gap and plan: D-032; changes: D-040 to D-043.

- [x] `make bench` (`tools/benchmark`; `--assert` checks the criterion). Medians, both compositions summed, H.264 CRF 18, muted (D-044):

| Platform | Concurrency 1 | 4 | 8 |
|---|---|---|---|
| macOS, Apple M5: Remotion / Motio | 6.54 / 1.75 s | 2.13 / 1.21 s | 1.58 / 1.31 s |
| Pinned image, linux-arm64: Remotion / Motio | 7.56 / 2.11 s | 2.54 / 1.32 s | 1.91 / 1.30 s |

- [x] Colour (palette within 1 code value, BT.709 tags), determinism, frame stamps and goldens still pass.

## M4: a real production project

Done when every video of a production Remotion project renders with no source changes, `doctor` reports no missing symbol, renders match the project's Remotion renders within the M1 thresholds and pass the flicker check. Projects chosen by the author on 2026-11-24: Remocn (a library of animations, transitions, backgrounds and scenes) and snapcn (product demo components), both MIT, by third parties, pinned to a commit, fetched at test time and never vendored; their Remotion renders are recorded locally like the templates' (D-054).

Where it stands (D-088, D-089, D-091; the suite runs with `MOTIO_PROJECTS=all`, outside `make check`): 121 Remocn and 59 snapcn compositions measured, the rest excluded with their reason in `fixtures/projects/`; every entry builds through the alias with no source change and `doctor` passes. Rendered with `gl: "swangle"`, as the references are recorded, Motio uses its GPU raster: 184 of 186 compositions within the thresholds, 148 identical, no `knownMismatch` left. Left:

- Run the suite and the D-089 to D-091 measurements in the pinned Linux image; everything so far was measured on macOS.
- Determinism against a fresh page: `paper-tear` (frames 54-56 and 59-60) and `orbit-gallery` (frames 147-149) still differ by one level on a few pixels in ascending runs, reported as `raster` (D-091); `moodboard-reveal` and `logo-assemble` differ inside downscaled photos through Chrome's image decode cache, which nothing outside Chrome can clear, reported as `image`.
- The GPU raster with software canvases, the shipped default for `gl: "swangle"`, was not run on the M4 projects during the D-089 measurement.

## M5: scale and formats

Scope: distributed rendering (local, then Lambda), alpha (WebM VP9, ProRes 4444), GIF output.

Done when:
- [x] Decoded frame hashes of a chunked render equal the single-node render, with no dropped or duplicated frames at chunk boundaries (frame stamps). Hashes for ProRes and lossless VP9; H.264 exact stamps and PSNR at least 40 dB (D-039).
- [x] The audio of a chunked render equals the single-node render's (D-039).
- [x] Alpha: ProRes 4444 and lossless VP9 within 1 code value of the PNG frames; lossy VP9 within the error D-019 measured for its CRF on smooth alpha (hard moving edges bounded as measured, D-037).
- The Lambda adapter passes an end-to-end test. Not started: it needs cloud spending; the `ChunkWorker` seam is ready (D-039).

## M6: a standalone tool (done, D-066)

Scope: what someone needs to make videos with Motio without knowing Remotion.

Done when:
- [x] `motio init` creates a project from Motio's own starters that installs, previews with `motio dev` and renders with no edits; an integration test covers every starter.
- [x] `docs/guide/` covers getting started, the core concepts (frames and time, sequences, animation, media, fonts, readiness), rendering from the CLI and from Node, FFmpeg, testing renders in CI, and coming from Remotion; every code sample in it is type-checked.
- [x] `@motiojs/preload` (D-070) and `<AnimatedImage>` (rewritten clean, D-071) work in the Player and in renders, with real-browser tests.
- [x] The Node API offers video metadata, audio extraction, silence detection and a browser reused across renders, each with an integration test.
- [x] `@motiojs/text` ships a configurable `<TextBackground>` (radius, padding, line joins, colour, border, shadow); `@remotion/rounded-text-box` maps onto it as a preset and equals the published function on its oracle.
