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

## D-007 Page pool: one browser process per page (2026-11-22)

Measured at 1080p, JPEG 80, 240 frames, Apple M5 with 10 cores: 1 page 9.5 fps; 2 pages 19.5 (one browser) against 20.6 (two browsers); 4 pages 31.7 against 33.6; 8 pages 33.3 against 54.7. Pages sharing one browser process saturate around 33 fps (one GPU and compositor process), while separate processes keep scaling. The pool therefore gives each page its own browser process, which also confines a crash to one page. Revisit if memory per process limits concurrency on small machines.

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

## D-013 BeginFrame capture on Linux, sandbox off only inside containers (2026-11-22)

Measured in the pinned image (`docker/`, linux-arm64, Debian trixie, chrome-headless-shell 158) at 1080p PNG, one page, 120 frames: `Page.captureScreenshot` 72.6 ms per frame, `HeadlessExperimental.beginFrame` with a screenshot 19.0 ms per frame (3.8 times faster), a screenshot on every frame. Decoded pixels are identical between the two paths on every deterministic fixture (frame-driven, effect state, CSS, Web Animations); only the fixtures that read the real clock differ, as expected without the shim. BeginFrame becomes the default capture path where the start-up probe succeeds (Linux), with the screenshot path as fallback and reference; scheduled in M2.

Docker's default seccomp profile blocks the user namespaces Chrome's sandbox needs. Inside the image the renderer passes `--no-sandbox` (set by `MOTIO_CHROME_NO_SANDBOX=1`), the container being the isolation boundary; outside containers the sandbox stays on.

## D-014 Audio mixer: a separate package, volume applied on time (2026-11-22)

The mixer lives in `@motiojs/audio` (Node), used by the renderer, so it is tested on its own against the media oracle. Sources are decoded by FFmpeg (trim, pitch, tempo, resampling), then placed, enveloped and summed in Node in float, and encoded once. A mono source is duplicated at full level: FFmpeg's default upmix lowers it by 3 dB, which Remotion does not do.

Against `fixtures/media`, click times match within 1 ms (offset, trim, volumes, ramp) and within 2 ms for `playbackRate` 2; constant volumes match within 0.01. Remotion applies volume changes about 1.5 frames late (up to 2.5 on the ramp); Motio applies the per-frame volume on time and does not reproduce the lag until its rule is known, because a 50 ms envelope offset is inaudible in practice and copying an unexplained artefact would be guesswork. Clicks inside that window are excluded from the peak comparison. Revisit if the rule is identified black-box.

## D-015 Embedded video: extracted frames, selection rule per component (2026-11-22)

`@motiojs/video-frames` selects the source frame from the packet timestamps of the stream (no decoding, so variable frame rate works) and extracts it as PNG with an accurate FFmpeg seek, batching following frames and caching them in an LRU with request deduplication. Against `fixtures/media`, the `floor` rule reproduces Remotion's `OffthreadVideo` and `@remotion/media` `Video` sequences exactly (24, 30, 59.94 and 60 fps sources, `playbackRate` 2, `trimBefore` with a `Sequence` offset).

Remotion's HTML5 `Video` is not frame-exact in renders: its recording jumps back to stale frames on 7 of 60 frames and rounds inconsistently on fractional positions, agreeing with the `nearest` rule on 48 of 60. Motio renders the HTML5 `Video` through the same extraction path with the `nearest` rule, which is deterministic and matches Remotion wherever Remotion is itself consistent. Revisit if a project depends on the native element during render (for example drawing it to a canvas), which the M3 `Video` ref design must cover.

## D-016 HTML5 `Video` keeps the native element in renders (2026-11-22, supersedes the HTML5 part of D-015)

Measured in chrome-headless-shell 158 with the frame-stamped sources: a native `<video>` seeked to the middle of the selected frame's interval (`(k + 0.5) / fps` for constant frame rate, the midpoint between the frame's timestamp and the next one in general), waiting for `seeked`, shows exactly frame k in 456 of 456 seeks (24, 59.94 and 30 fps, random order with backward seeks). `requestVideoFrameCallback` does not fire in headless-shell without compositor frames, so `seeked` is the readiness signal. Seeking only works when the server answers HTTP `Range` requests: without them every seek shows frame 0, so the renderer's static server must support `Range`.

So the HTML5 `Video` renders the real element, seeked to the midpoint of the frame chosen by the `nearest` rule from timestamps the host provides (D-015). Refs keep pointing at an `HTMLVideoElement`, and drawing it to a canvas works. `OffthreadVideo` and `@remotion/media` `Video` keep the extraction path, which also covers codecs Chrome cannot decode (ProRes, HEVC on Linux).

## D-017 Google Fonts: generated modules, committed (2026-11-23)

`@motiojs/google-fonts` has one generated module per family (`@motiojs/google-fonts/<ImportName>`, exporting `fontFamily`, `getInfo`, `loadFont` and, for variable families, `loadVariableFont`) plus `getAvailableFonts()`. `scripts/generate.ts` reads Google's public font metadata and the CSS2 API (static and variable faces, per subset); the set of families is the one `@remotion/google-fonts` 4.0.545 lists, recorded from its public `getAvailableFonts()`, so import paths match one for one. All 1,848 families generate; the recorded samples match in exports, styles, weights, subsets, unicode-range subsets and variable axes. File URLs differ from Remotion's (Google varies them by user agent) and are not compared.

The generated modules (about 10 MB of source) are committed and excluded from lint: builds stay offline and reproducible, and a regeneration shows up as a reviewable diff. Revisit if regeneration churn makes the history heavy; the alternative is generating at publish time.

## D-018 Chunk assembly: MPEG-TS chunks, concat without re-encoding (2026-11-23)

`@motiojs/distributed` plans contiguous chunks (optionally aligned to a GOP) and assembles video-only MPEG-TS chunks with FFmpeg's concat demuxer and stream copy, then muxes the audio rendered once (D-014). Tested with frame-stamped chunks encoded independently by libx264 with 3 B-frames: 240 frames in chunks of 37 at 30 and 29.97 fps decode to exactly frames 0 to 239, once each, in order, and audio muxes alongside. MPEG-TS is used because MP4 chunks carry edit lists for B-frame delay that the concat demuxer does not apply, which shifts or duplicates frames at boundaries. Next: the renderer gains a chunk output mode (frame range to MPEG-TS) and a local worker adapter implements `ChunkWorker`.

## D-019 Alpha output recipes (2026-11-23)

Measured with RGBA PNG frames (alpha gradient plus a half-transparent box) encoded and decoded back to RGBA:

| Recipe | Max alpha error | Max colour error on opaque pixels |
|---|---|---|
| ProRes 4444: `prores_ks -profile:v 4444 -pix_fmt yuva444p10le -vendor apl0` | 1 | 0 |
| VP9 lossless: `libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -lossless 1` | 1 | 0 |
| VP9 lossy, `-crf 4 / 10 / 15 / 20 / 31 -b:v 0` | 2 / 3 / 3 / 7 / 12 | 0 |

`-auto-alt-ref 0` is required for VP9 alpha. Reading the alpha of a VP9 WebM needs the `libvpx-vp9` decoder (`-c:v libvpx-vp9` before `-i`): FFmpeg's native VP9 decoder drops the alpha plane, which also applies to `@motiojs/video-frames` when the source is a transparent WebM. The M5 alpha criterion therefore reads: ProRes 4444 and lossless VP9 within 1 code value of the PNG frames; lossy VP9 within the error measured here for its CRF.

## D-020 GIF output recipe (2026-11-23)

GIF output encodes the captured frames with a palette built for the clip: `-filter_complex "[0:v]split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none"`. On a 2 s test signal this gives 41.3 dB PSNR against the source frames, with every frame present. `everyNthFrame` selects frames before encoding and divides the frame rate (every 3rd frame of 30 fps gives 20 frames at 10 fps for 60 inputs). Remotion's `numberOfGifLoops` maps to FFmpeg's `-loop`: `null` (loop forever) is `-loop 0`, `0` (play once) is `-loop -1`, which omits the NETSCAPE loop extension, and `n` (repeat n times) is `-loop n`, checked in the written loop extension. Dithering is off by default for deterministic, flat output; an option can enable it later.

## D-021 `viteOverride` replaces `webpackOverride` (2026-11-23)

`bundle()` rejects `webpackOverride` with an error that points to `viteOverride`, a function that receives and returns the Vite configuration (D-003). `remotion.config.ts` setters with no equivalent (`overrideWebpackConfig`) record a warning instead of throwing, and `enableTailwind` is recognised and turned into `@tailwindcss/vite` (v4) or PostCSS (v3).

## D-022 Player browser tests use puppeteer-core (2026-11-23, supersedes the Playwright part of D-012)

The Player's real-browser tests drive the pinned chrome-headless-shell with puppeteer-core, already used by the renderer, instead of Playwright: one browser binary and one driver for the whole repository, no extra browser download. Playwright remains an option if cross-browser Player tests are added.

## D-023 `useWindowedAudioData` is approximated (2026-11-23)

For WAV files the loaded windows, `resultId`, `dataOffsetInSeconds`, sample rate, duration and errors match Remotion, but Remotion repeats one sample at each window boundary (its windows run 1 to 3 samples long) while Motio's windows tile the file exactly; on windowed data `visualizeAudio` then differs by up to 0.042 and `visualizeAudioWaveform` by up to 0.0028. Non-WAV files are decoded whole at 48 kHz and sliced. Every other `@motiojs/media-utils` function matches exactly or within 1e-12 (`packages/media-utils/COMPAT.md`). Motio keeps the exact tiling: duplicating a sample is an artefact, not a contract.

## D-024 M1 closed (2026-11-23)

Every M1 criterion in `ROADMAP.md` is backed by a committed test that passes in `make check`: pure functions against the oracle (exact or within 1e-12), frame stamps over 3,000 frames at concurrency 1, 4 and 8 in random order, the React fixtures, determinism across runs, orders and concurrencies, the colour round trip with `ffprobe` checks, the 28 fixture stills against Remotion (SSIM at least 0.9975, PSNR at least 45.9 dB), and error codes with label and frame. An adversarial review of the M1 code found six defects (an asynchronous `cancelRender()` reported as a page error, `--frames` lists, `check determinism` never rendering in descending order, frames missing from crash errors, non-atomic stills, the default check concurrency on 1-thread machines); all are fixed with tests. The repository builds and renders from a clean `git archive` inside the pinned Linux image.

