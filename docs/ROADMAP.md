# Roadmap

A milestone is done only when every criterion below holds and `make check` is green. Thresholds are part of the contract: changing one is a decision recorded in `DECISIONS.md`.

## Current state

M1 done (D-024), M2 done (D-049), M3 done, performance done (D-044). Left: M4 (needs a production project chosen by the author), the cloud adapters of M5 (need approved cloud spending), the remaining Tier 2 and Tier 3 packages.

- M2: transitions (SSIM at least 0.9994 on the fixture), captions, shapes, paths, noise, layout-utils, zod-types, google-fonts, fonts; the compat alias, `Config`, Tailwind setup and the symbol manifest. BeginFrame capture on Linux (D-033, identical pixels), opt-in since screenshots caught up (D-043). Five official templates build unmodified with Remotion's metadata (D-025), including Hello World after `Interactive`, `Easing.spring` and non-numeric `interpolate` outputs landed (D-034 to D-036). Every template still is identical to Remotion's render since D-041 closed the transparent-edge mismatch (D-031, D-038). Every Tier 1 symbol of the manifest is supported or stubbed (D-045). All seven official templates build unmodified and every still is identical to Remotion's, Three with `@motiojs/three` (D-046) and TikTok with `@motiojs/animation-utils` (D-047). `fixtures/features` is compared in full: shapes, paths and noise are pixel-identical to Remotion's stills, transitions above 44 dB. The twelve HTML-in-canvas presentations and `makeHtmlInCanvasPresentation()` draw through Chrome's HTML-in-canvas API on Remotion's lifecycle (D-058): against `fixtures/transitions-canvas` all within the M1 thresholds, nine identical on every frame, blurSlide at least 50 dB; `motionBlur` on transitions is not applied yet.
- M3: every criterion has a committed test. The media components (`@motiojs/media`, D-029), the renderer's media service, audio pass, audio muxing and audio-only codecs (D-030), the Player's media playback with shared audio tags, `motio dev` (D-026), media-utils. Measured: every `fixtures/media` video composition shows the expected source frames exactly; audio clicks land within 0.000 ms of Remotion's with peaks within 0.004 outside the volume-lag window (the time-stretched case within 2 ms); a Video in the Player follows the real clock with at most 0.044 s of drift.
- Tier 2 packages: `@motiojs/three` (D-046), `@motiojs/animation-utils` (D-047), `@motiojs/motion-blur` (D-048, `<HtmlInCanvasMotionBlur>` D-059) and `@motiojs/starburst` (D-055), each equal to the published package on its oracle and rendered stills (starburst identical for whole ray counts). `@motiojs/light-leaks` (D-056) matches the published props, markup and timing but draws its own pattern (approximated). Left: `<ThreeWebGPUCanvas>` and `@remotion/effects` with the effect factories `lightLeak()` and `starburst()`, which need an effect pipeline in core (D-057, D-060).
- Tier 3 packages: `@motiojs/lottie` (D-052) and `@motiojs/gif` (D-053), each equal to the published package on its oracle (frame timing, decoded GIF frames, `getLottieMetadata`, `getGifDurationInSeconds`); `fixtures/gif` stills identical to Remotion's, `fixtures/lottie` identical for the SVG renderer and at least 47.4 dB for canvas and HTML. Left: Skia, Rive, the transcription adapters, client-side rendering and the other Tier 3 packages.
- Performance: done (D-044). Motio renders the benchmark in 0.27 to 0.83 of Remotion's wall time on macOS and 0.28 to 0.68 in the pinned Linux image.
- M5: chunk planning and assembly (`@motiojs/distributed`), every documented codec but AV1 in the renderer with alpha (ProRes 4444, VP8, VP9) and GIF output, image sequences in the CLI (D-018 to D-020, D-037). Chunked rendering with a local worker (`renderDistributed`, `motio render --chunks`, D-039). Left: the Lambda and Cloud Run adapters, which need cloud spending the author has to approve; the `ChunkWorker` seam is ready for them.

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
- Determinism: identical decoded frame hashes across 2 runs, 2 orders and 3 concurrencies on the same machine.
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

Done when every video of a production Remotion project renders with no source changes, `doctor` reports no missing symbol, renders match the project's Remotion renders within the M1 thresholds and pass the flicker check. Needs a project chosen by the author.

## M5: scale and formats

Scope: distributed rendering (local, then Lambda), alpha (WebM VP9, ProRes 4444), GIF output.

Done when:
- [x] Decoded frame hashes of a chunked render equal the single-node render, with no dropped or duplicated frames at chunk boundaries (frame stamps). Hashes for ProRes and lossless VP9; H.264 exact stamps and PSNR at least 40 dB (D-039).
- [x] The audio of a chunked render equals the single-node render's (D-039).
- [x] Alpha: ProRes 4444 and lossless VP9 within 1 code value of the PNG frames; lossy VP9 within the error D-019 measured for its CRF on smooth alpha (hard moving edges bounded as measured, D-037).
- The Lambda adapter passes an end-to-end test. Not started: it needs cloud spending; the `ChunkWorker` seam is ready (D-039).
