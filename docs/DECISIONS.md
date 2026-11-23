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


## D-025 Official templates: fetched at pinned commits, resolved from a parent package, compared at scale 1 (2026-11-23)

The M2 template proof (`fixtures/templates`) fetches each official template at a pinned commit into a gitignored cache and never commits its code: the templates carry no open-source licence (`UNLICENSED`, pointing to the Remotion License), and fetching the public repositories at test time needs none. The commits are the heads that go with `remotion@4.0.545`, not older revisions chosen to pass. "Zero edits" is read strictly: nothing is installed into the template and no file changes; its imports resolve from `fixtures/templates/node_modules`, a workspace package that depends on `motio`, the mapped `@motiojs/*` packages and the third-party versions the templates pin, as a monorepo parent would. Reference stills are rendered at scale 1: at scale 0.5 Motio's and Remotion's rasterisation differ (both use a device scale factor; SSIM 0.982, PSNR 27 dB on a still that matches at 52 dB at scale 1), which would mix renderer differences into the template proof. Templates that cannot build yet stay in the suite as expected failures naming the missing symbol or package, and known still mismatches are listed with their cause; each of these tests fails once the cause is fixed.

## D-026 `motio dev`: a Player page served by Vite, with a render check (2026-11-23)

The preview page is its own browser package, `@motiojs/preview`, served by `startDevServer()` in `@motiojs/bundler`, which reuses `bundle()`'s settings (compat alias, React deduplication, env variables, Tailwind, `viteOverride`) and adds `@vitejs/plugin-react` for Fast Refresh, limited to the project's own files so Motio's packages never become refresh boundaries. Choices beyond the docs:

- The bundle context (`staticFile()` base and list, `process.env`) is set by a classic inline script in the page, not a module, because dependencies read `process.env` while they are evaluated; it is not frozen there, since Vite's client assigns its `define` values onto it. The public directory is served from `/` by a small static middleware with `Range` support (D-016), because Vite's public middleware cannot serve names containing `#`, which `staticFile()` encodes.
- The stage resets inherited CSS (`all: initial`) and applies the render page's zero-specificity `border-box` rule: with the page's line height inherited, preview and render of the CLI fixture scored SSIM 0.992; with the reset, 0.9999. The integration test requires 0.999.
- "Render still" goes through the real pipeline: the CLI passes the server a handler, so the bundler does not depend on the renderer. It rebuilds a production bundle only after a watched file changed, then runs `selectComposition` with the page's props and `renderStill` as PNG at scale 1, one request at a time; an aborted request cancels its render.
- An explicit `--port` is strict (`E_PORT_IN_USE`); `Config.setStudioPort()` or the default 3000 moves to the next free port. Nothing opens by default (Remotion's Studio opens a browser), `--open` does; agents and CI start servers more often than people do. `--json` prints one object as soon as the server listens and nothing after it, so stdout stays one JSON value; SIGINT, SIGTERM and SIGHUP close the server and remove the session's files.
- In the preview, `getRemotionEnvironment()` reports `isPlayer` (it is a Player page) and `getInputProps()` returns `{}`, while Remotion's Studio reports `isStudio` and returns `--props`; `--props` seeds the props editor instead. Revisit if projects branch on either in the preview.

## D-027 Google Fonts generated with the user agent that matches Remotion's files (2026-11-23, refines D-017)

Google's CSS2 API serves differently subset woff2 files per user agent, with different glyph metrics: the official Overlay template rendered a text box 2 px narrower than Remotion's because the generator used a recent macOS Chrome user agent. With a Windows Chrome 120 user agent Google returns exactly the files `@remotion/google-fonts` 4.0.545 references. The generator now uses it, all 1,848 modules are regenerated, and the tests require identical file URLs, unicode ranges and variable faces for every recorded sample.


## D-028 Mono sources upmix at -3 dB, as Remotion's output measures (2026-11-23, supersedes the mono part of D-014)

D-014 duplicated a mono source into both stereo channels at full level, from a comparison of the mixer's first channel with the oracle's clicks. But the media recorder decodes Remotion's output with `-ac 1`, FFmpeg's stereo downmix `(L + R) / sqrt(2)`, so the oracle peak (0.9155, the click's own amplitude in `clicks.wav`) is what a stereo output with each channel at -3 dB measures, the result of FFmpeg's default mono-to-stereo matrix (or of a mono output). Full-level duplication measured 1.2947 through the recorder's method, 41% louder than Remotion. The mixer now lets FFmpeg convert channel layouts with its default matrix, and the mixer test measures through the same downmix as the recorder; every click time and constant-volume peak still matches (D-014's tolerances). Stereo sources are unaffected.

## D-029 `@motiojs/media`: one package for the media of `remotion` and `@remotion/media` (2026-11-23)

The package root mirrors `@remotion/media` (`Video`, `Audio`, and `experimental_Video`, `experimental_Audio` as aliases), because the compat alias maps that package here. The `remotion` components are exported under their unambiguous names (`Html5Video`, `OffthreadVideo`, `Html5Audio`); `motio` re-exports them and adds `Video` and `Audio` as the former names of `Html5Video` and `Html5Audio`, which is what `remotion` 4.0.545 exports under those names. `AudioForPreview` and `getTargetSampleRate` are undocumented and not exported. `Img` stays in core: it needs nothing from the host, and moving it would change core's exports for no gain.

Choices beyond the docs:

- **One timeline model.** Every component wraps its media in a `Sequence` without layout whose child frame is the source position in composition frames (`trimBefore + elapsed * playbackRate`), so nesting, `Loop`, `Freeze` and premounting behave as for any sequence. `trimAfter`/`endAt` become a `durationInFrames`; when both limit the range the shorter wins. A loop without a finite range lasts the media duration rounded down to whole frames (Remotion's own `OffthreadVideo` looping recipe), read from the host in a render and from the element's metadata in a preview.
- **Volume callbacks** receive the frames elapsed since the media started, on its parent's timeline (restarting per loop iteration with `loopVolumeCurveBehavior="repeat"`), and apply on time (D-014).
- **Renders.** `OffthreadVideo` shows the host's extracted frame in an `<img>` and the `@remotion/media` `Video` draws it into a `<canvas>` at the source's size with `objectFit` as CSS (both `floor`, D-015); the HTML5 `Video` keeps the native element (D-016). There is no fallback chain: FFmpeg decodes everything Mediabunny would hand to a fallback, so `onError` returning `"fallback"` only keeps the render going when `fallbackOffthreadVideoProps.onError` handles the error, as it would for `OffthreadVideo`. `toneFrequency` and `audioStreamIndex` apply in renders only; `effects` fail with a clear error.
- **Previews** use native elements for every component, including the `@remotion/media` ones (Remotion decodes those with Mediabunny into a canvas and Web Audio): they play on the real clock at the Player's rate times their own, seek when they drift beyond `acceptableTimeShiftInSeconds` (default 0.45 s), and take the component's volume times the Player's, clamped to 1. `@remotion/media` components hold the Player while buffering by default, the others with `pauseWhenBuffering`. `Html5Audio` borrows one of the Player's shared audio tags, which the Player unlocks on every play request; borrowing more than `numberOfSharedAudioTags` throws, as documented.

## D-030 Media service, audio pass and audio output (2026-11-23)

- **Media service.** Each render session starts a small HTTP server on 127.0.0.1 next to the bundle server, passed to the page as `RunContext.mediaBaseUrl` (protocol 2). Its routes take the media URL the page uses: `info` (duration, video size and frame count, audio streams), `frame` (the PNG of the source frame for a time and a selection rule, with or without alpha) and `locate` (the frame's index and the midpoint a native element must seek to). Frame selection runs on the host from packet timestamps (D-015), so the page never needs the timestamp list. A separate server instead of a route on the bundle server or Fetch interception: it works the same when `serveUrl` is a remote URL, and media on the bundle's origin is read from the bundle directory directly. Responses carry `Access-Control-Allow-Origin: *`, so extracted frames can be drawn to a canvas.
- **Audio intents per frame.** A component reports, on each frame it plays, the source position in composition frames, the cumulative playback rate, pitch, volume and stream. The renderer joins consecutive output frames into one segment while the position advances by exactly the rate; a seek, a loop restart, a mute or a gap starts a new one. This needs no component identity across pages (React's client ids count mounts), and two identical sources that differ only in volume play the same samples, so their order does not matter.
- **The audio pass.** Intents are collected from the frames the capture already seeks, and the frames it skips (`everyNthFrame`, audio-only codecs) are seeked without capturing. In the frame time model a frame's intents depend only on the frame, so this equals seeking every frame in a separate pass at a fraction of the cost. The audio covers every frame of `frameRange` (ranges concatenate as the video does) at the composition's fps; `muted` renders no audio and no track.
- **Output.** `codec` `h264` muxes AAC (default) or MP3; `mp3`, `aac` and `wav` (PCM 16-bit) render audio only. Remotion's table of audio codecs per container did not render in its docs, so this is the subset Motio can encode today; `preferLossless` picks PCM where the container allows it, which MP4 here does not. `audioBitrate` defaults to 320k as documented, `sampleRate` to 48000. With no audible source the track is omitted unless `enforceAudioTrack`, `separateAudioTo` or an audio-only codec asks for silence. AAC is encoded in the same FFmpeg run that muxes it, so the encoder delay stays compensated by the container (the WAV and MP4 renders of `audio-offset` correlate at a lag of 0 samples). Sources without the requested audio stream are skipped. `forSeamlessAacConcatenation` fails with a clear error until chunked renders need it (D-018 muxes the audio rendered once).

## D-031 Transparent edges of scaled layers: open, default compositing unchanged (2026-11-23)

Two template stills (OnlyLogo 20, Overlay 30) miss the thresholds only at the antialiased edges of a scaled element over a transparent background (PSNR 33 and 38 dB; on white the same frames match at 52 dB). Measured so far: the element has the same size in both renders (337.0 against 337.02 px wide); Remotion's edges carry a faint bilinear resampling halo (alpha 2 to 3 outside the edge) that Motio's do not. Ruled out: fonts (fixed separately, D-027), the Chrome patch version (Motio rendering with Remotion's own 158.0.8127.2 binary gives the same result), and the command line (observing the running process shows Remotion launches Chrome with the same GL and determinism flags, GPU compositing through SwiftShader). Compositing in software (`--disable-gpu-compositing`) reproduces Overlay exactly but moves the 3D `flip` transition from SSIM 0.9995 to 0.989, so the default stays GPU compositing through SwiftShader. Next lead: page-level differences in how the composition container is layered (a wrapper transform or layer that makes Chrome rasterise the scaled element at scale 1 and resample it). The two stills stay marked as known mismatches in `fixtures/templates/templates.json`.

## D-032 Throughput against Remotion: measured gap and the plan to close it (2026-11-23)

Head-to-head on the same machine (Apple M5, 10 cores), same compositions (`fixtures/compositions` motion and timeline, 60 frames rendered at scale 3 = 1920x1080), H.264 at CRF 18, muted, total wall time including browser start:

| Concurrency | Remotion 4.0.545 | Motio | Motio, `x264Preset: "ultrafast"` |
|---|---|---|---|
| 1 | 3.5 to 3.9 s | 5.4 to 6.3 s | |
| 4 | 1.4 to 1.9 s | 3.0 to 4.4 s | 2.9 s |
| 8 | 1.2 to 1.6 s | 3.7 to 4.7 s | 2.5 s |

Motio is 1.6 to 3 times slower today. Causes measured so far:

1. **Pool layout (revisits D-007).** On the real bundle at 1080p, seek plus JPEG capture alone reaches 63 fps with one browser per page and 77 fps with 8 pages in one browser; D-007 had measured the opposite on a trivial scene. Pages sharing one browser (or a few) should be the default, with the process-per-page layout as an option for crash isolation.
2. **Colour conversion of JPEG frames.** The exact path (JPEG YCbCr to 16-bit RGB to BT.709 YUV, accurate rounding) encodes at 70 fps offline and produces files 64% larger than a range-only conversion that keeps the BT.601 matrix (138 fps, 46.6 dB against the captured frames, against 48.4 dB for the exact path); Remotion's files are of the smaller kind and carry no colour tags. Candidate default: the range-only path tagged BT.601 (`smpte170m`), keeping the exact BT.709 path behind `colorSpace: "bt709"`.
3. **Remaining pipeline overhead.** Even with the encoder at `ultrafast`, the full render reaches about half the raw capture throughput: per-frame work in the renderer between capture and encoder (transfer, reorder buffer, backpressure, the media service and audio-intent collection added in M3) needs profiling.

A performance criterion is added to the roadmap: wall time at most Remotion's at concurrency 1, 4 and 8 on these compositions, measured by a committed benchmark script.

