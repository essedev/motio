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

## D-033 BeginFrame capture in the renderer: probed, default on Linux, with a pre-frame (2026-11-23)

The renderer resolves `captureMethod` (a Motio option, `--capture-method`, `$MOTIO_CAPTURE_METHOD`) per session: `auto` launches the browser once with the BeginFrame flags of D-013 and keeps BeginFrame if a `HeadlessExperimental.beginFrame` returns a screenshot of the right size, else the screenshot path; macOS skips the probe (BeginFrame control is not available there). `begin-frame` forces the path and fails with `E_BEGIN_FRAME_UNSUPPORTED` where the probe fails; `screenshot` keeps the reference path. Listing compositions never probes. Measured in the pinned image (linux-arm64) and what the implementation needed beyond the spike:

- **Scale.** BeginFrame screenshots ignore the emulated device scale factor, so a BeginFrame browser is launched with `--force-device-scale-factor` set to the render's `scale` (identical pixels to the screenshot path at scale 2).
- **First frames.** The first BeginFrames after a navigation can return no screenshot while the compositor initialises; the capture retries up to 10 times before `E_CAPTURE_FAILED`.
- **No frames between captures.** Under BeginFrame control style, layout and `requestAnimationFrame` run only inside a frame. While any page call is in flight, frames without display updates are sent every 16 ms, so `requestAnimationFrame` keeps working; a seek that settles within 16 ms sends none. Before each captured frame, a frame without display updates runs style and layout, and the capture waits for the images, fonts and style sheets that frame requested (tracked through the Network domain, after a round trip through the page's main thread so the request events arrive first), repeating until a frame requests nothing. Without it, a CSS background image was missing from the first frame of every page, which `check determinism` caught.
- **Identity.** `packages/motio/src/begin-frame.integration.test.ts` captures every `fixtures/compositions` frame of `frames.json`, the first, middle and last frame of every `fixtures/media` composition (native and extracted video), the 30 frames of the CLI fixture (a CSS background image), 120 frame stamps in PNG and 30 in JPEG, the palette, effect-state and alpha fixtures with both paths: every decoded frame is identical. The frame-stamp test (3,000 frames at concurrency 1, 4 and 8, random order) passes with zero mismatches on the BeginFrame path, and the CLI's `check determinism` passes; at 512x288 it ran at 102, 146 and 186 fps against 20, 81 and 127 fps on the screenshot path (runs on a shared machine vary by about 30%).
- **Speed.** 240 frames at 1920x1080, one page: PNG 63.5 ms per frame with the screenshot path against 20.1 ms with BeginFrame (3.16 times faster), JPEG 63.4 against 17.5 ms (3.61 times). The pre-frame costs part of the 3.8 times D-013 measured without it.

Revisit if Chrome removes `HeadlessExperimental.beginFrame` from headless-shell, or if the pre-frame proves insufficient for a resource type it does not track (media elements are excluded because they stream).


## D-034 `Easing.spring`: validated lazily, two configurations throw instead of hanging (2026-11-23)

`Easing.spring(config)` follows remotion.dev/docs/easing (a spring measured over 30 frames at 30 fps) and the recordings: inside the segment it is `spring({ frame: t * 30, fps: 30, durationInFrames: 30, durationRestThreshold })`, at or before 0 it returns 0, at or after 1 it returns 1, and with `allowTail` it continues as the unstretched spring at frame `t * natural duration`. Like Remotion, the configuration is validated the first time the spring is evaluated inside (0, 1) or in its tail, not when the easing is created, so `Easing.spring({ damping: 0 })` only throws once used. The returned function carries `remotionShouldExtendRight`, set to the `allowTail` value, which `interpolate()` reads (D-035).

Two configurations never return in Remotion (the recorder gives up after 20 s, and in-process they leave later `Easing.spring` calls failing with `RangeError: Too many properties to enumerate`): `stiffness: 0` and `durationRestThreshold: 0`. Motio throws instead (`Spring stiffness must be greater than 0, ...` from `measureSpring()`, and `durationRestThreshold must be greater than 0 for Easing.spring(), ...`). `measureSpring()` now throws its threshold errors as `TypeError`, as Remotion does; the messages are unchanged.

## D-035 `interpolate()` non-numeric outputs: one numeric core over vectors, rules completed black-box (2026-11-23)

The documented output types of `interpolate()` (CSS `scale`, `translate`, `rotate` and `transform-origin` strings, numeric tuples, font weights, discrete strings and booleans) and the `output` and `outputType` options are implemented as one numeric core over vectors: each output range is resolved into a plan (one vector per keyframe and a formatter back to the output type), and posterize, wrap, extrapolation, easing, `perceptual-scale` and tails run per component. Numeric ranges go through the same path with one-component vectors, keeping the arithmetic that made the numeric fixtures bit-identical. The CSS parser lives in `interpolate-css.ts`.

The docs name the forms but not the edge rules (when a string counts as a CSS value, defaults of missing components, how a rotation without an axis meets one with an axis, number formatting, error order, what an easing with `remotionShouldExtendRight` adds). Each rule was found by testing hypotheses against the recordings and is listed in `packages/core/COMPAT.md`; the oracle grid (38,266 values, 133 validation cases) is what keeps them honest. The rotation-axis rule in particular fits all 12 recorded multi-keyframe cases but is a fitted rule, not a derived one: a new recording that contradicts it means changing the rule. `Easing.in()` stays the identity: Remotion accepts `Easing.in(Easing.step1)` where only `Easing.step1` itself is allowed.

## D-036 `Interactive`: render semantics recorded through `@remotion/player`'s `Thumbnail`, Studio editing out of scope (2026-11-23)

`Interactive` exists to make elements editable in the Remotion Studio; Motio has no Studio, so only what it renders matters. The docs say the elements take the props of `<Sequence>` and of the underlying element, but not what DOM results. To record it black-box, `tools/oracle` now depends on `@remotion/player` 4.0.545 and renders scenes inside its public `<Thumbnail>` with `react-dom/server`, at chosen frames. The recorded markup shows that an element renders itself with no wrapper (a `<Sequence layout="none">` around the element, with the element as the visual root), that crops become a `clip-path` on the element's style and premounting adds `opacity: 0; pointer-events: none`, and what props a component wrapped by `withSchema()` or `create()` receives. The Motio test renders the same scenes with `react-dom/server` and compares the markup exactly.

The schema helpers (`Interactive.textSchema`, ...) are plain data exported with the recorded values so that compositions spreading them build; nothing reads them. `Interactive._internalMakeRemotionComponentIdentity` is internal and not provided.

Found on the way, not changed here: Remotion's `<Sequence>` crop writes percentages unrounded and makes overlapping opposite crops meet at 50%, while Motio's `cropClipPath` in `timeline/sequence.tsx` rounds to 6 decimals and meets at the midpoint of the overlap. `Interactive` uses Remotion's rule.

## D-037 Codecs and formats: the codec table, recipes and alpha bounds (2026-11-23)

`renderMedia` encodes every documented video `codec` but `av1`, through one table (`packages/renderer/src/codecs.ts`):

| Codec | Encoder, container | CRF (Remotion's table) | Pixel formats, default first | Audio codecs, default first |
|---|---|---|---|---|
| `h264`, `h264-mkv`, `h264-ts` | libx264; MP4, Matroska, MPEG-TS | 1 to 51, 18 | `yuv420p`, 4:2:2, 4:4:4, 10-bit | MP4 and TS: aac, mp3; MKV: aac, mp3, opus, pcm-16 |
| `h265` | libx265, MP4 tagged `hvc1` | 0 to 51, 23 | as H.264 | aac, mp3 |
| `vp8` | libvpx, WebM | 4 to 63, 9 | `yuv420p`, `yuva420p` | opus |
| `vp9` | libvpx-vp9, WebM | 0 to 63, 28 | `yuv420p`, `yuva420p`, 4:2:2, 4:4:4, 10-bit | opus |
| `prores` | prores_ks (`-vendor apl0`), MOV | none (rejected) | `yuv422p10le`; `yuv444p10le` for 4444 profiles; `yuva444p10le` with 4444 or 4444-xq | pcm-16 (documented), aac |
| `gif` | palette, GIF | none (rejected) | RGB(A) | none |

Choices beyond the docs:

- **Audio per container.** Remotion's compatibility table does not render in its docs (D-030), so each container lists what FFmpeg muxes into it; WebM takes only Opus, whose encoder runs at 48, 24, 16, 12 or 8 kHz (other `sampleRate` values fail early). A GIF renders no audio: `audioCodec`, `enforceAudioTrack` and `separateAudioTo` fail with it.
- **VP8 runs in constrained quality** with a 1000M bitrate cap: libvpx's VP8 encoder ignores the CRF with `-b:v 0` (CRF 4 and 9 both gave the same 68 kB file at 37.8 dB on a 2 s test signal; with the cap, CRF 9 gives 52.6 dB).
- **VP9 CRF 0 is lossless** (`-lossless 1`): Remotion's table calls 0 the best quality, and libvpx's CRF 0 alone is not lossless. Alpha needs `-auto-alt-ref 0` (D-019) for VP8 as well.
- **ProRes** defaults to `hq` or the composition's `defaultProResProfile`; `proResProfile` and `proResBitsPerMacroblock` with another codec fail, as do a CRF and alpha with a 4:2:2 profile. FFmpeg's decoder reports 4444 streams as 12-bit, and FFmpeg 7 writes no range into the MOV colour atom (ProRes is limited range by definition).
- **Alpha** needs `imageFormat: "png"` and an alpha pixel format; anything else fails before rendering.
- **GIF** is encoded in three FFmpeg runs: the captured images are copied to an intermediate file, the D-020 palette is built from all of it, then every frame is mapped to it, so long GIFs never hold their frames in memory. PNG capture keeps transparency. `numberOfGifLoops` follows D-020 and is ignored by other codecs.
- **Image sequences** are a CLI output, as Remotion documents (`--sequence`, `setImageSequence()`, a `--frames` list of single frames, `--image-sequence-pattern`, JPEG by default) into a folder, by default `out/<name>`: `renderMedia`'s output must be a file. The JSON result has `codec: null` and `sequence: true`.
- **`av1`** fails with `E_UNSUPPORTED_CODEC`: common FFmpeg builds (Homebrew's) carry no AV1 encoder, and Remotion itself does not offer AV1 on Linux arm64.
- **Matroska and AAC.** The AAC priming makes the audio of an MKV start at -21 ms; FFmpeg 7 decoding at a constant rate then duplicates the first video frame, so the tests decode frames as stored.

Measured in the pinned image and on macOS (same numbers): frame stamps decode exactly from every codec (60 frames each, GIF every 3rd frame at 10 fps), with the expected codec, pixel format, BT.709 tags, frame count and default audio codec. Alpha against the PNG frames of a fixture with an alpha ramp, a moving half-transparent box and an opaque frame stamp: ProRes 4444 and 4444 XQ and lossless VP9 within 1 code value in alpha and 0 in opaque colour; VP8 at its default CRF within 2. 4:2:0 chroma subsampling mixes the colour of transparent neighbours into opaque pixels next to them (up to 50 code values at the end of the red ramp), so opaque colour is compared at least 2 px from transparency. Lossy VP9 stays within D-019's bounds on the ramp (2 at CRF 4 and 20, 3 at 31), but the moving box's hard alpha edges ring more than D-019's static signal showed (3, 16, 16; 18 at the default CRF 28). The M5 alpha criterion therefore applies D-019's bounds to smooth alpha, and the tests bound the whole frame at the measured values plus headroom (4, 18, 20).

## D-038 Transparent edges (D-031), further leads ruled out (2026-11-23)

Now three template stills are affected (Hello World Logo 20 joined OnlyLogo 20 and Overlay 30). Attaching read-only to Remotion's browser during a render shows the same element geometry as Motio's page (the Overlay box is 337.344 x 221 px in both, no `will-change`, `contain` or transform on any ancestor); the ancestors differ only in that Remotion's `html`, `body` and canvas container are 1080 px tall and in normal flow, while Motio's are 0 px tall with an absolutely positioned canvas. Synthetic pages isolating that difference, and the transform history (mounting at scale 0 then seeking, with and without intermediate frames), give pixel-identical edges. The cause stays open; the remaining difference to examine is how each page applies the frame (Remotion's capture timing relative to compositor frames).

## D-039 Chunked rendering: renderChunk, a local worker and renderDistributed (2026-11-23)

The renderer gains two Motio functions, `renderChunk()` (a frame range to a video-only chunk with the encoder settings of a full render, each chunk its own encode starting on a keyframe) and `renderAudio()` (the audio pass and mixer of `renderMedia` over a frame range, written as a 32-bit float WAV), plus `planChunkedRender()`, which validates a chunked render exactly as `renderMedia` would before any chunk starts. `@motiojs/distributed` adds `LocalChunkWorker` (one Node child process per chunk running `renderChunk`; a cancel asks the child to close its browsers and FFmpeg and kills it after 10 s) and `renderDistributed({ serveUrl, composition, codec, outputLocation, framesPerChunk | chunks, concurrency, concurrencyPerChunk, worker, ... })`: plan, render chunks in parallel while the audio renders once, assemble with `assembleChunks`. Choices beyond the docs:

- **Chunk containers.** MPEG-TS for H.264 and H.265 (D-018), WebM for VP8 and VP9, MOV for ProRes, which reorder no frames. GIF (one palette for the clip), audio-only codecs and `everyNthFrame` are rejected for chunked renders, and `frameRange` must be one range.
- **Audio is encoded during assembly.** The audio rendered once is kept as float samples and encoded by AAC (or the container's codec) in the same FFmpeg run that concatenates the chunks, as `renderMedia` encodes the same samples while muxing, so the priming stays compensated and the bitstream is the same. An `hvc1` tag is reapplied for H.265 in MP4.
- **Workers.** `ChunkJob` is plain JSON (the resolved composition, the chunk, an output location and the data options of `renderChunk`), so a remote adapter (Lambda, Cloud Run, Kubernetes) implements `ChunkWorker.renderChunk` by running `renderChunk` where the bundle is reachable and making `job.output` available to the orchestrator; none is implemented, because testing one needs cloud spending. `concurrency` counts chunks rendering at once (default half the CPU threads, at most 8), `concurrencyPerChunk` the pages of each (default 1, as Remotion's `concurrencyPerLambda`).
- **CLI.** Remotion's CLI has no local chunked rendering, so `motio render --chunks=<n>` or `--frames-per-chunk=<n>` (with `--concurrency` counting chunks and `--concurrency-per-chunk`) is a Motio flag.
- **What "equal to the single-node render" can mean.** A lossy inter-frame encoder decides frame types and bits per GOP, so H.264 chunks are not bit-identical in decoded pixels to one encode of the whole range. Decoded frame hashes are compared where the codec's output does not depend on GOP placement: ProRes (intra-only) and lossless VP9, including their alpha variants and frames extracted from a media file; H.264 is held to exact frame stamps and a PSNR floor.

Measured in the pinned image (BeginFrame capture) and on macOS: 240 frame-stamped frames in 7 H.264 chunks of 37 decode to frames 0 to 239 once each, in order, with BT.709 tags, worst PSNR 44.1 dB against the single-node encode; ProRes and lossless VP9 chunked renders (also ProRes 4444 and VP9 with alpha, and an `OffthreadVideo` composition) have decoded frame hashes identical to the single-node render; the audio of three `fixtures/media` compositions (offset and trim, volume ramp, `playbackRate` 2) rendered in three chunks equals the single-node render sample for sample after decoding.

## D-040 Encoder input: no probe of the image pipe, JPEG colour converted in YUV (2026-11-23)

Profiling the full pipeline (timestamps around page open, seek, capture, encoder writes and the encoder's exit; 1080p, 60 frames, Apple M5) showed FFmpeg finishing about 600 ms after the last capture at every concurrency: by default FFmpeg reads up to 5 MB of an input to find its stream parameters before decoding, so on a short render it encoded nothing until stdin closed. The image pipe is now read with `-probesize 32 -analyzeduration 0` (codec and frame rate are given, the size comes from the first image): decoded frames identical, tail about 295 ms. Remotion's FFmpeg command line, observed while it renders, avoids the same delay with `-nofind_stream_info` on its own input format.

The exact JPEG path (Chrome's full-range BT.601 YCbCr to 16-bit RGB to BT.709 YUV, `accurate_rnd+full_chroma_int`) resampled the chroma twice and halved x264's speed. Measured on the captured frames of both benchmark compositions (x264 `medium`, CRF 18, PSNR against the captured frames decoded to RGB):

| Path | Encode, motion / timeline | Size, motion / timeline | PSNR, motion / timeline |
|---|---|---|---|
| Exact via 16-bit RGB (before) | 105 / 176 fps | 436 / 238 kB | 47.2 / 46.7 dB |
| Range only, BT.601 kept and tagged (D-032 candidate) | 231 / 396 fps | 401 / 199 kB | 46.0 / 47.9 dB |
| `colorspace` filter, BT.709 (chosen) | 225 / 385 fps | 312 / 200 kB | 48.2 / 46.9 dB |

The `colorspace` filter converts only matrix and range in YUV (`fast=1`: the pixels are sRGB, primaries and transfer are only tagged) and keeps the chroma samples Chrome encoded. It runs on frames first normalised to 8-bit planar YUV marked full range, because FFmpeg versions disagree on whether converting the decoder's `yuvj` formats also compresses the range (FFmpeg 8.1 still decodes JPEG to `yuvj420p`). The output stays BT.709, limited range, with the same tags, so the colour criterion and its test are unchanged; the palette round trip's worst error went from 1.97 to 1.00 code values with JPEG capture (1.00 with PNG, whose path is unchanged). D-032's range-only candidate is not needed: it is barely faster and would have changed the tags. Encoder settings otherwise stay: Remotion runs libx264 without `-preset` (its documented default `medium`) at CRF 18, as Motio does; fewer x264 threads lengthened the tail (`-threads 4`: 1005 against 611 ms), `-filter_threads` gained nothing, and stdin writes never waited more than 2 ms (mean under 0.1 ms), so the pipe and the reorder buffer need no change. Seek took 1 to 8 ms per frame and base64 decoding is negligible.

## D-041 Chrome draws unthrottled; opaque captures composite in software, transparent ones rasterise on the CPU (2026-11-23, closes D-031 and D-038)

`Page.captureScreenshot` took 49 ms per 1080p frame on one page whatever the format (D-006): Chrome draws at most one frame per display refresh and the screenshot waited for the next frames. `--disable-frame-rate-limit` draws a frame as soon as the capture asks for one: one page captures about 100 fps instead of 20. With software GL, GPU compositing made SwiftShader composite every frame on the CPU and pages competed for it (capture time at 8 pages rose from 49 to 145 ms on average). Measured raster and compositing variants, on capture speed and against Remotion's reference stills:

- Software compositing (`--disable-gpu-compositing`): fastest (8 pages about 330 fps of raw capture); every `fixtures/compositions` golden and template still identical to Remotion's render (PSNR infinite, was 46 to 73 dB), including the D-031 transparent edges; but the 3D `flip` transition over a transparent background misses the 40 dB floor (35.5 and 33.8 dB, SSIM 0.989): its antialiased edges lose alpha values of 1 to 6 that Remotion's carry.
- CPU raster with GPU compositing on SwiftShader (`--disable-gpu-rasterization`): every golden and template still identical, the flip frames at 44.1 and 45.7 dB, the D-031 edges identical: this is what Remotion's browser does. Capture is slow, 37 to 62 fps at 1 to 8 pages.
- GPU raster and compositing (the previous default): neither identical nor fast (17 fps on one page, 52 to 63 at 4 to 8).

So the compositing follows the capture: opaque captures (JPEG, the video default) composite in software, transparent ones (PNG with alpha, where edge alpha is visible in the output) rasterise on the CPU and composite on SwiftShader (37 fps on one page, against 17 before). Both draw 2D content identically; on opaque 3D-transformed layers the two differ only at antialiased edges (the flip frames at 41.1 and 38.2 dB, SSIM 0.9987 and 0.9977, every other transition frame identical). That difference is accepted for speed: the Remotion-exact compositing for opaque frames could not meet the performance criterion, and stays one option away (`chromiumOptions.flags: { "disable-gpu-compositing": false, "disable-gpu-rasterization": true }`). Hardware GL keeps Chrome's own choice. WebGL still runs on SwiftShader with software compositing.

Faster captures exposed a race the 49 ms had hidden: a CSS background image is requested only when style and layout run, and `check determinism` caught the first frames of a page without the CLI fixture's background. Before every screenshot the page now reads its layout and waits for the images, fonts and style sheets that requested, the loop BeginFrame pages already ran (D-033). The D-031 known mismatches are removed from `fixtures/templates/templates.json`: every template still is identical to Remotion's.

## D-042 Browser pool: pages spread over two browsers (2026-11-23, revisits D-007)

A session keeps a pool of browsers: pages with the same launch settings share one up to `pagesPerBrowser`, a recycled page is a new tab on the same browser, a crashed browser leaves the pool and its pages' frames are retried on a new one, and the session kills every browser when it closes (still before a render returns, including a cancelled one). With unthrottled frames and software compositing, raw capture (seek plus screenshot on the real bundle, 1080p, 10 CPU threads) scales with the layout: at 8 pages, 4 browsers of 2 reach about 330 fps, 2 of 4 about 250, 8 of 1 about 165 and 1 of 8 about 153 (one browser draws its pages' frames through one compositor). End to end, with x264 encoding on the same CPU, fewer browsers win, because each browser process takes CPU the encoder needs: two browsers render fastest at every concurrency tried (2: 2x1 0.74 s against 0.81 s for 1x2; 4: 2x2 0.68 s against 0.75 s for 4x1 and 0.79 s for 1x4; 6: 2x3 0.72 s; 8: 2x4 0.73 s against 0.83 s for 4x2 and 1.09 s for 8x1; motion composition). Default: the pages are spread over two browsers, and browsers of four pages are added above concurrency 8. `pagesPerBrowser` (a Motio option, `--pages-per-browser`, passed to chunk workers) chooses another layout; 1 restores D-007's isolation of one process per page. D-007's measurement (separate processes scaling better) held for GPU compositing through SwiftShader, which made pages of one browser compete for one compositor on the CPU.

## D-043 `captureMethod: "auto"` captures with screenshots everywhere (2026-11-23, revisits D-033)

BeginFrame was the Linux default because it was about 3 times faster than throttled screenshots. With D-041 the screenshot path is as fast on one page and faster on several, because BeginFrame cannot share a browser: with a second tab under BeginFrame control, headless Chrome stops returning screenshots for both. In the pinned image (linux-arm64, Docker on the same M5, 10 CPUs), motion plus timeline took 2.12, 1.33 and 1.31 s with screenshots at concurrency 1, 4 and 8, against 2.04, 1.62 and 1.86 s with BeginFrame. `auto` now resolves to the screenshot path without launching a probe; `begin-frame` stays available (identical pixels, D-033), always with one page per browser. In the pinned image every integration test that does not depend on macOS-recorded stills passes with the new default, including the BeginFrame identity tests, frame stamps, determinism, colour, codecs, media, chunked rendering and the crash and recycle tests.

## D-044 Performance criterion met (2026-11-23)

`tools/benchmark` (`make bench`) renders `fixtures/compositions` motion and timeline at scale 3 (1920x1080, 60 frames each, H.264 CRF 18, muted) with Motio and with the pinned Remotion, each side in its own Node process, in alternating rounds, and reports the median wall time per concurrency (browser start and encoding included, the bundle excluded) with the machine and the browser and FFmpeg versions of both sides; `--assert` fails if Motio is slower. Remotion runs its own Chrome 158.0.8127.2 (patched to hand frames to its FFmpeg through shared memory, `--remotion-shared-memory-capture`) and FFmpeg n7.1; Motio runs chrome-headless-shell 158.0.8127.36 and the system FFmpeg. Times are the sum of both compositions (D-032 gave them per composition).

| Platform, concurrency | Remotion | Motio before | Motio after | After / Remotion |
|---|---|---|---|---|
| macOS (Apple M5, 10 threads, FFmpeg 8.1.2), 1 | 6.54 s | 7.84 s | 1.75 s | 0.27 |
| macOS, 4 | 2.13 s | 3.90 s | 1.21 s | 0.57 |
| macOS, 8 | 1.58 s | 3.96 s | 1.31 s | 0.83 |
| Linux (pinned image, linux-arm64, 10 CPUs, FFmpeg 7.1.5), 1 | 7.56 s | 3.59 s | 2.11 s | 0.28 |
| Linux, 4 | 2.54 s | 2.66 s | 1.32 s | 0.52 |
| Linux, 8 | 1.91 s | 2.87 s | 1.30 s | 0.68 |

Medians of 9 runs after, 6 before; "before" is the code at the start of this work (screenshot capture on macOS, BeginFrame in the image). Effect of each change on macOS, sum of both compositions unless noted: the probe fix (D-040) cut the encoder tail from about 600 to 295 ms per render; unthrottled frames with software compositing (D-041) took the benchmark to 2.10, 2.01 and 2.58 s; the colour path and the shared browsers (D-040, D-042) to 1.74, 1.34 and 1.45 s; two browsers by default to 1.75, 1.21 and 1.31 s. The colour, determinism, frame-stamp and golden criteria hold (`make check`). Left: at concurrency 8 the x264 tail (about 285 ms of `medium` lookahead after the last frame) and page start (about 250 ms) are most of the remaining time; Remotion's shared-memory transfer needs its patched browser and is out of reach for a stock Chrome.

## D-045 Tier 1 gaps closed: undocumented exports recorded black-box, stubs for the rest (2026-11-23)

Every Tier 1 symbol of the manifest is now supported or stubbed. Where remotion.dev documents a symbol it is implemented from the docs (`IFrame`, `stitchFramesToVideo`, `LogLevel`, `RenderMediaOnProgress`, `WebpackOverrideFn`, `remotion/no-react` as `motio/no-react`). Exports without a docs page were handled by what can be observed from outside:

- Plain data is recorded from the published package and Motio exports the same value, checked by a test: `absoluteFillSchema` (`tools/oracle/record-exports.mjs`, it equals the `Interactive` schemas base, transform, background, border, radius, text and children in that order) and the `@remotion/renderer/client` editor constants (`tools/oracle-render/record-exports.ts`), now in `@motiojs/renderer/client`.
- `assertValidInterpolateEasingOption(easing, inputRangeLength)` and `assertValidInterpolatePosterizeOption(posterize)` are the option checks `interpolate()` runs; their behaviour is recorded over a grid of 126 and 16 inputs (messages and error types) and matches exactly. Recording them showed a divergence in `interpolate()` itself: an easing array holding a non-function threw later with an unrelated error; it now throws `easing[i] must be a function` like Remotion, because `interpolate()` calls the same check.
- `Config` from `remotion` is Remotion 3's configuration object. The published one is a proxy whose namespaces (`Rendering`, `Output`, `Bundling`, `Log`, `Puppeteer`) are objects and every other key a fresh function; calling one prints the 4.0 migration message and exits the process with code 1. Motio's has the same shape and throws an `Error` carrying the same message instead of exiting: a library that exits its host process would take down a dev server or a test runner, and the CLI's config loader already reports the thrown error.
- `@remotion/media`'s `getTargetSampleRate` and `AudioForPreview` have no docs page and cannot be fully observed: they are `stubbed`, so the compat plugin warns at build time. `getTargetSampleRate()` returns 48000, what the published package returns in Node and in chrome-headless-shell 158; `AudioForPreview` throws a message pointing to `<Audio>`.

`IFrame` renders `<iframe referrerPolicy="strict-origin-when-cross-origin" {...props}>` (markup recorded from the published component), holds a readiness handle from layout until the `load` event, and forwards `delayRenderTimeoutInMilliseconds` and `delayRenderRetries` to it. React does not wire `onError` on iframes, so a page that never loads holds the capture until the handle times out, which reports its label.

`stitchFramesToVideo` needs what `renderFrames()` collected, so `RenderAssetInfo` (documented as unstable between versions) now carries the image sequence on disk (directory, pattern, format, padding), the composition fps, the frames the audio covers with the audio intents of each, and the bundle's URL and directory, so local media sources resolve after the render's server has closed. `renderFrames()` runs the same audio pass as `renderMedia()` for the frames `everyNthFrame` skips (D-030) unless `muted`. Stitching streams the images through the `renderMedia()` encoder and mixes the audio with the same mixer: the stitched audio equals `renderMedia()`'s sample for sample on the `fixtures/media` click track, for the whole composition and for a frame range. The options `renderMedia()` does not support either (`videoBitrate`, `bufferSize`, `maxRate`, `gopSize`, `metadata`, `ffmpegOverride`, hardware acceleration) fail with `E_INVALID_OPTION`; frames of another size than `width` and `height` fail before encoding; audio-only codecs point to `renderMedia()`.

## D-046 `@motiojs/three`: an R3F root of fixed size, drawn in a layout effect; `staticFile()` resolves its base like Remotion's bundle (2026-11-23)

`ThreeCanvas` is built on React Three Fiber's `createRoot` rather than its `<Canvas>`: `<Canvas>` measures its container with a ResizeObserver (asynchronous, and wrong under a CSS `scale`, the bug the docs give as the reason `width` and `height` are required), while a root configured with `size: { width, height }` is ready in the same commit. Every React context reaches the three.js tree through `its-fine`'s `useContextBridge`, the mechanism `<Canvas>` uses. The other `<Canvas>` props go to the root unchanged (`gl`, `camera`, `linear`, `flat`, `orthographic`, `dpr`, `shadows`, ...); pointer events connect to the container as in `<Canvas>`. The `<Sequence>` timing props wrap it in a `layout="none"` sequence named `<ThreeCanvas>`, hidden from the timeline by default.

While rendering, `frameloop` is forced to `"never"` (documented) and each frame holds a readiness handle from the DOM tree's commit until the three.js tree has committed the same frame and drawn it with `advance()`. When to draw is not documented and decides pixels: drawing after the children's passive effects missed Remotion's stills of `fixtures/three` by 30 to 32 dB, because the fixture moves the camera in a `useEffect`; drawing in a layout effect of a sibling after the children (after their layout effects, before their passive effects) made every still identical (PSNR infinite). So a camera moved in an effect is not applied to the first frame a page draws, in Remotion as in Motio. The Three template shows the same timing: its video texture is updated from `onVideoFrame` with `invalidate()`, which draws nothing under `frameloop="never"`, so the phone screen is black in Remotion's stills and in Motio's.

WebGL references are recorded with `chromiumOptions.gl: "swangle"` (`tools/oracle-render/record.ts --gl=swangle`, `gl` in `fixtures/templates/templates.json`): Motio's default renderer is SwiftShader through ANGLE, and Remotion's default on macOS draws WebGL on the GPU, which no software renderer matches. Measured: `fixtures/three` `three` (perspective camera, standard and Phong materials, three lights, a `Sequence` with `layout="none"`) identical at five frames; `three-timing` (`from`, `playbackRate`, `linear`, `flat`, an orthographic camera, a transparent canvas over a CSS gradient) SSIM 0.9979 to 0.9994, PSNR 56.8 to 62.4 dB, the residue being the gradient, which differs as much on frame 0 where the canvas is not mounted yet. The Three template: identical at frames 30, 150 and 250.

`useVideoTexture()` and `useOffthreadVideoTexture()` are deprecated and their reference pages return 404, so their signatures cannot come from the docs: they are stubbed and throw, pointing to the documented `@remotion/media` recipe. `ThreeWebGPUCanvas` (`@remotion/three/webgpu`) is not implemented; the manifest does not list that subpath yet.

The template exposed a `staticFile()` difference. Remotion's bundle writes `window.remotion_staticBase = new URL("./public", window.location.href).pathname` into its `index.html` (read from the generated page, not from Remotion's source), so served from the root `staticFile("phone.mp4")` is `/public/phone.mp4`; Motio returned `./public/phone.mp4`, which the template stores in its props, so the metadata differed. Motio's bundle context now resolves a relative static base the same way, also for the `src` of `getStaticFiles()`; an absolute `publicPath` is left as is.

## D-047 `@motiojs/animation-utils` reproduced black-box; extracted video frames lose their colour tags; every official template matches (2026-11-23)

The docs of `@remotion/animation-utils` give the transform builders by example (`rotate(45)` is `"rotate(45deg)"`, `translate(10, "%")` is `"translate(10%)"`) and `interpolateStyles(input, inputRange, outputStylesRange, options?)` by signature only; how they validate and how `interpolateStyles` parses CSS values is not documented. Both were reproduced from the published package's outputs: an implementation was compared against it on generated inputs, the differences were read and the implementation changed, until no input differed. The final comparison covered 2.1 million argument lists for the builders (every list of up to four values from an 18-value pool, per builder), 280,000 unit strings, and 118,000 `interpolateStyles` calls (value pairs, random multi-token values, options, multi-keyframe ranges with per-segment easings, invalid calls). The committed oracle (`tools/oracle-features`, `pnpm record animation-utils`) keeps a deterministic subset: 18,418 builder calls and 10,566 `interpolateStyles` calls, every one equal. What the published package does that a reader would not guess, kept on purpose because user code may depend on it:

- Unit strings must end with an allowed unit (case-sensitive) and contain a digit or dot directly followed by a lowercase letter or `%` anywhere (`"x10px"` and `"1eQ"` pass, `"10Q"` fails); the second error lists the length units even for angles. A unit given as an argument is appended unchecked (`translateX(1, 2)` is `"translateX(12)"`), except in the four-argument `skew()`.
- `interpolateStyles` takes the properties of the keyframe at or before the input; a property missing from the next keyframe keeps its value. Tokens are function calls with a non-empty argument list up to the first `)`, or runs of non-space characters. A number token moves towards whatever the end token is: units must match unless either side is zero, a color, function or word on the end side counts as 0 (a word lends its text as the unit). Colors are what `interpolateColors()` parses. Function arguments are split on commas outside parentheses, an empty last one dropped. A result that reads as a number becomes a number (`"1.5"` to `"2"` gives `1.75`). A `0` on either side bypasses the type check, a `NaN` end counts as 0, and other value types interpolate to 0.

`watchStaticFile` (Tier 2), which the TikTok template imports, works only in the Remotion Studio; outside it the published function warns `The watchStaticFile() API is only available while using the Remotion Studio.` and returns `{ cancel }`. Motio does the same and the manifest marks it stubbed.

With both, the TikTok template built and its stills missed (SSIM 0.957, PSNR 32.6 dB) only inside the `OffthreadVideo`, darker in the mid-tones by up to 13 code values. FFmpeg 8 writes the video's colour tags into the PNG frames the media service extracts (`cICP` with the BT.709 transfer, `gAMA`, `cHRM`), and Chrome colour-manages tagged images; the raw pixels equal the frames Remotion shows. `@motiojs/video-frames` now strips the colour chunks (`cICP`, `iCCP`, `sRGB`, `gAMA`, `cHRM`) from extracted frames, and the TikTok stills are identical. Frame-stamp checks never saw it: stamps are black and white, which no transfer curve moves. All seven official templates now build unmodified and every still is identical to Remotion's (Three recorded with `swangle`, D-046).

## D-048 `@motiojs/motion-blur` from Remotion's markup; the Sequence container drops `flex-direction` (2026-11-23)

The docs give the props of `<CameraMotionBlur>` (`shutterAngle` 180, `samples` 10) and `<Trail>` (`layers`, `lagInFrames`, `trailOpacity`) and what they do, not how. Their output was read from the published components rendered at chosen frames inside `@remotion/player`'s `<Thumbnail>` around a child that prints `useCurrentFrame()` (`tools/oracle/record-motion-blur.mjs`, 182 renders over props, frames and enclosing Sequences, plus 23 invalid prop sets rendered in jsdom for their messages):

- `<CameraMotionBlur>` is an `isolation: isolate` absolute fill holding the children at the current frame, transparent when blurred, then one absolute fill per sample with `mix-blend-mode: plus-lighter` and `filter: opacity(1 / n)`, each showing the children at `frame - exposure * (i / n) + 1` for `i` from 1 to `n` (so after the current frame), where `exposure = shutterAngle / 360` and `n = min(samples, round(frame / exposure))`. With `n` at most 1, or a zero angle, only the children show. Sample times stop at the composition's last frame (not the enclosing Sequence's).
- `<Trail>` is an absolute fill holding, for `i` from `layers` down to 1, an absolute fill at opacity `trailOpacity - (i / layers) * trailOpacity` showing the children at `frame - i * lagInFrames` kept within the composition's frames, then the children themselves.
- Expressions are written in the order that reproduces Remotion's floating-point results, so the markup is equal character for character. The children of each copy see a fractional frame through `<Freeze>`.

Rendered against Remotion's stills of `fixtures/motion-blur` (a fast, rotating, colour-changing square and a ring over a gradient; default camera blur, a 360° six-sample blur, an eight-layer trail): eleven of thirteen stills identical, the last frame of both blurs at 68.4 and 70.6 dB (ten copies of the same clamped frame added together). `<HtmlInCanvasMotionBlur>` needs Chrome's experimental HTML-in-canvas API and is not provided; the manifest keeps it missing. Media inside copies follows `<Freeze>`; the docs' newer "frame reuse" (all samples share the current media frame) is not reproduced.

Recording the markup inside Sequences exposed a core divergence: Remotion's `<Sequence>` container (also behind `<Series.Sequence>` and `<Loop>`) is an absolute fill with `display: flex` and no `flex-direction`, so children in normal flow line up in a row; Motio's had `flex-direction: column`. The container now matches. `<AbsoluteFill>` keeps its `column`, as Remotion's does.
