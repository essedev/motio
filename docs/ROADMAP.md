# Roadmap

A milestone is done only when every criterion below holds and `make check` is green. Thresholds are part of the contract: changing one is a decision recorded in `DECISIONS.md`.

## Current state

M1 done (D-024). M3 done: every criterion has a committed test (see below). In progress or left:

- M2: transitions (SSIM at least 0.9994 on the fixture), captions, shapes, paths, noise, layout-utils, zod-types, google-fonts, fonts; the compat alias, `Config`, Tailwind setup and the symbol manifest. Left: BeginFrame capture on Linux in the renderer, the official Hello World template (blocked on `Interactive`, `Easing.spring` and string `interpolate` outputs, being implemented), two template stills with transparent edges (D-031), and manifest statuses for every Tier 1 symbol. Four official templates already build unmodified with Remotion's metadata (D-025).
- M3: every criterion has a committed test. The media components (`@motiojs/media`, D-029), the renderer's media service, audio pass, audio muxing and audio-only codecs (D-030), the Player's media playback with shared audio tags, `motio dev` (D-026), media-utils. Measured: every `fixtures/media` video composition shows the expected source frames exactly; audio clicks land within 0.000 ms of Remotion's with peaks within 0.004 outside the volume-lag window (the time-stretched case within 2 ms); a Video in the Player follows the real clock with at most 0.044 s of drift.
- M5: chunk planning and assembly (`@motiojs/distributed`), alpha and GIF recipes (D-018 to D-020). Left: the renderer's chunk output mode, the local and Lambda workers, alpha and GIF output in the renderer.

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
- Oracle stills: the fixture compositions match Remotion's render of the same code with mean SSIM at least 0.99 and PSNR at least 40 dB, worst frame SSIM at least 0.97.
- Errors: a readiness timeout reports its code, label and frame; every `--json` output validates against its schema.

## M2: compatibility breadth

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
- Player: Playwright tests cover the ref API and events.

## M4: a real production project

Done when every video of a production Remotion project renders with no source changes, `doctor` reports no missing symbol, renders match the project's Remotion renders within the M1 thresholds and pass the flicker check. Needs a project chosen by the author.

## M5: scale and formats

Scope: distributed rendering (local, then Lambda), alpha (WebM VP9, ProRes 4444), GIF output.

Done when:
- Decoded frame hashes of a chunked render equal the single-node render, with no dropped or duplicated frames at chunk boundaries (frame stamps).
- Alpha: ProRes 4444 and lossless VP9 within 1 code value of the PNG frames; lossy VP9 within the error D-019 measured for its CRF.
- The Lambda adapter passes an end-to-end test.
