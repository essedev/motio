# Cycles

Progress log, newest first. One entry per unit of work: what changed, what was measured, what is next.

## 2026-11-24/25: brand, site and promo; `motio.config.ts`; virtual time; M4 on Remocn and snapcn

- Brand and outward material: Kinetic with the Flipbook mark (D-077); the site in Astro and Starlight reads every page from the repository, with `llms.txt` built from the docs (D-079); the promotional material is a Motio project in `promo/` (D-080), the issues it found are fixed (D-082), and its teaser has a filter house soundtrack synthesised in code (D-084). The entry package is `@motiojs/motio`, since npm refused `motio` (D-081). BeginFrame capture is deprecated (D-078).
- A newcomer followed the guide outside the repository; every friction point was fixed with a test (D-083): `make try` from a clone, the FFmpeg on `PATH` when the pinned build cannot be downloaded, errors with the frame and the mapped source location, page warnings returned and printed, the nearest flag or command and exit code 2 for invalid input, the preview's timeline and Problems panel, a Player clock that waits for its media, browsers killed when the process stops. New projects get `AGENTS.md` and a `CLAUDE.md` importing it.
- `motio.config.ts` (D-085): typed, read by every command, `MOTIO_*` variables over it and flags over both, `loadConfig()` for Node scripts; every starter writes one.
- Time: the virtual time model (D-086), its open points closed by D-090: CSS transitions play from the style change, renders pin the time zone to UTC and the language to `en-US` (`--time-zone`, `--locale`), the frame model holds animation-frame and timer loops between seeks, `check determinism` suggests the virtual model when the pages reported clock-driven code.
- Pixels: transparent captures clear the tiles under sliding scenes (D-087). `raster` and `canvas` (D-089): Remotion's pixels depend on its `gl`, so Motio uses the CPU raster and software canvases by default and the GPU raster when a project sets `gl: "swangle"`; `make bench --assert` passes with the defaults. Where Chrome composites on SwiftShader, tiles are rasterised with one copy and reuse textures only at their size; `check determinism` names Chrome's image decode cache as the cause `image` (D-091).
- M4 (D-088): Remocn and snapcn build unmodified through the alias and `doctor` passes; every comparison with Remotion adds a 32 px block check. With the GPU raster 184 of 186 compositions are within the thresholds (148 identical) and no known mismatch is left; of the 10 determinism failures measured, 6 pass, 2 are named `image`, and `paper-tear` and `orbit-gallery` still differ by one level on a few pixels in ascending runs.
- Next: repeat the D-089 to D-091 measurements and the M4 suite in the pinned Linux image (everything was measured on macOS); then what needs the author (the publishing steps in the backlog, cloud spending for M5).

## 2026-11-24: M6, a standalone tool; deterministic pixels for real

- Direction (D-066): Motio stops chasing parity with Remotion; compatibility is pinned at 4.0.545, guarded by the existing tests and updated on a schedule, and only people entitled to run Remotion record the oracle.
- M6 done: `motio init` with Motio's own starters and `create-motio` (D-069), the user guide in `docs/guide/` with every sample type-checked, `@motiojs/preload` and `@motiojs/text` with a general `<TextBackground>` that the rounded-text-box preset equals byte for byte on 1,009 inputs (D-070), Node media functions and `openBrowser` (D-068), `<AnimatedImage>` (D-071).
- A clean-room breach (a research subagent read Remotion's source for `<AnimatedImage>`) led to removing that implementation and rewriting it with an agent that never saw it (D-067, D-071); every brief now repeats the rule.
- Determinism: a raster reset before each capture fixes pixels that depended on the tab's history (D-072), M1's check now compares every run with a new page per frame and would have caught it (D-074), BeginFrame waits until the page is on screen and runs one page at a time (D-075), a pooled browser that died unnoticed is replaced (D-076), the output extension must fit the codec (D-073). Benchmark criterion still met.
- Brand: three concepts (Frame, Terminal, Kinetic) in `docs/concepts/` for the site and the logo, waiting for the author's choice.
- Next: the site in Astro on the chosen direction, promotional material made with Motio, M4 on a production project, a decision on deprecating BeginFrame.

## 2026-11-23: AV1 output and the optional pinned FFmpeg

- `av1` renders (D-064): SVT-AV1 3.0 or later, else libaom, else an older SVT-AV1; CRF 0 to 63 (30), 8- and 10-bit 4:2:0, CRF 0 lossless, chunks in WebM. Frame stamps exact on macOS (SVT-AV1 4.2.0) and in the pinned image (libaom 3.12.1, because its SVT-AV1 2.3.0 mis-encodes blocks of the fixture and has no lossless mode). D-037's claim that Homebrew's FFmpeg has no AV1 encoder corrected.
- `@motiojs/ffmpeg` (D-065): a pinned FFmpeg 8.1.3 with x264, x265, SVT-AV1, libvpx, dav1d, Opus, LAME and Mbed TLS, downloaded on first use or with `motio ffmpeg ensure`, verified by size, SHA-256 and a run of both binaries, installed with one atomic rename. Resolution order everywhere: option, `MOTIO_FFMPEG`, the package, `PATH`; `doctor` and `motio render --json` name the source.
- `tools/ffmpeg-build/` and `.github/workflows/ffmpeg-build.yml`: pinned, verified sources; static Linux builds in a pinned Alpine image; macOS arm64 native and x86_64 cross-compiled; archives built here for darwin-arm64, darwin-x64, linux-arm64 and linux-x64 (under emulation). Nothing published: the author creates the repository, sets the release owner, runs the workflow, updates the manifest digests, and has the GPL setup reviewed.

## 2026-11-23: Rive, transcription, Skia assessed; autonomous work done

- `@motiojs/rive` (D-061): 26 of 26 fixture stills identical to Remotion's, frame-exact independently of render order.
- Transcription (D-062): `@motiojs/install-whisper-cpp`, `@motiojs/openai-whisper`, `@motiojs/elevenlabs`; pure conversions equal to the published packages on 2,188 inputs; whisper.cpp end to end identical on 13 option sets (opt-in test, `MOTIO_WHISPER_CPP=1`). No paid API called.
- `@remotion/skia` assessed (D-063): bundling works with three bundler changes, but deterministic capture needs a readiness rule for React Native Skia resources that Remotion does not define; stubbed until the author decides.
- `make check` green with 1440 tests. What remains needs the author: M4 project, cloud spending for Lambda and Cloud Run, the Skia readiness rule, the effect pipeline scope (D-057), D-009 confirmation, the history rewrite and a legal review before publishing.

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
