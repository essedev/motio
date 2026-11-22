# Roadmap

A milestone is done only when every criterion below holds and `make check` is green. Thresholds are part of the contract: changing one is a decision recorded in `DECISIONS.md`.

## Current state

Spike done (D-005, D-006). M1 in progress.

## Spike (done)

- [x] Time model measured on eight fixtures in five orders (D-005).
- [x] Capture throughput per format and resolution (D-006).
- [x] Capture throughput against concurrency (D-007).
- Moved into M1 as integration tests: frame stamps, React fixtures, colour round trip, BeginFrame in the Linux container.

## M1: single-node render

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

Scope: `Img`, fonts, Google Fonts, Tailwind, `remotion.config.ts` and `Config`, env vars, static files, transitions, captions, Zod schemas, shapes, paths, noise, layout utils; the symbol manifest and `doctor`.

Done when:
- Every Tier 1 symbol in the manifest is supported with a test or stubbed with a build-time message.
- Each transition presentation and the shapes match the oracle within the M1 SSIM thresholds.
- Caption parsing equals the oracle output.
- Three official Remotion templates (fetched at test time, not vendored) build through the alias with zero edits and render within the M1 thresholds.

## M3: media and Player

Scope: `Video`, `OffthreadVideo`, `Audio`, `@remotion/media`, the audio pass and mixer, the Player, `motio dev`.

Done when:
- Video: a source with a burned-in frame number, converted 24 to 30, 30 to 60 and 59.94, with `playbackRate` 2 and trim, gives the oracle's source-frame sequence exactly.
- Audio: click-track offset at most 1 ms, loudness within 0.5 LU of Remotion's output, no seams.
- Player: Playwright tests cover the ref API and events.

## M4: a real production project

Done when every video of a production Remotion project renders with no source changes, `doctor` reports no missing symbol, renders match the project's Remotion renders within the M1 thresholds and pass the flicker check. Needs a project chosen by the author.

## M5: scale and formats

Scope: distributed rendering (local, then Lambda), BeginFrame on Linux, alpha (WebM VP9, ProRes 4444), GIF output.

Done when:
- Decoded frame hashes of a chunked render equal the single-node render, with no dropped or duplicated frames at chunk boundaries (frame stamps).
- Alpha within 1 code value of the PNG frames.
- The Lambda adapter passes an end-to-end test.
