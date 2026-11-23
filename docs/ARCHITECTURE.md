# Architecture

Status: accepted for implementation, 2026-11-22. Revised after an adversarial review and the time-model spike (see `DECISIONS.md`). The project is called Motio: the unscoped `motio` package is the entry point (the equivalent of `remotion`), the other packages live under `@motiojs/*` because the `@motio` scope is taken on npm.

## What this is

An open-source framework for making videos with React. A video is a React tree that is a pure function of the frame number. The engine renders it in a real headless Chrome, captures it one frame at a time and encodes it with FFmpeg.

The public API is compatible with Remotion's documented API, so existing Remotion projects can move over by changing their imports, or with no change at all through the bundler alias. The engine is written from scratch: it uses Remotion's documentation and observable behaviour, never its source code.

**Compatibility target: `remotion@4.0.545`.** Every "compatible" claim refers to this version. `compat/manifest.json` lists each public symbol of the target (package, symbol, props or options, tier, status: supported, approximated, stubbed, missing). The manifest drives `doctor`, the stubs and the compatibility tests, and moving the target is an explicit change that re-records the oracle.

## Goals

1. **Fidelity.** The pixels are the ones Chrome draws. There is no reimplementation of CSS, layout or text: if it looks right in Chrome, it renders right.
2. **Determinism.** The same project, props and frame number give the same pixels, on every run and in any order. Across machines the guarantee holds for the same OS, CPU architecture and container image with the pinned Chrome and software GL; macOS and Linux, or arm64 and x64, are never expected to match. Enforced by tests on decoded frame hashes, never on encoded files (x264 output depends on its thread count).
3. **Compatibility.** Remotion's public API, in tiers (see "API surface"), checked against values and frames recorded from the published package.
4. **Agent-first tooling.** Every command has machine-readable output (`--json`, validated against a published schema), errors with stable codes, and commands that let an agent check its own work without watching a video: stills, contact sheets, flicker and determinism checks, a compatibility report.
5. **Complete for most use cases.** Data-driven videos at scale, captions, social clips, product demos, audio visualisers, embedded players and video editors built on the Player, automated and distributed rendering.
6. **Free for any use.** Apache-2.0, no per-render or per-seat fee, including distributed rendering and embedding the Player in a product.

## Non-goals for v1

- **A Studio editor.** A `dev` preview page built on the Player covers watching motion while editing (see "Preview"). Prop forms, timelines and render queues serve people who do not write code, and can be built on the Player later.
- **A browserless renderer.** The opposite trade-off (speed over fidelity), already explored by other projects.
- **Client-side rendering with WebCodecs.** A later tier.
- **A hosted cloud service.** Distributed rendering ships as a library and adapters for the user's own infrastructure.

## Prior art and what we take from it

| Project | Licence | What we take |
|---|---|---|
| HyperFrames (HeyGen) | Apache-2.0 (verified) | The capture pipeline closest to ours: pinned `chrome-headless-shell` with determinism flags, BeginFrame capture on Linux with screenshot fallback, video frames extracted by FFmpeg and served through request interception, the streaming encoder with a reorder buffer, chunked distributed rendering. Code may be ported with its licence and NOTICE, after checking the file is not itself derived from Remotion. Not its catalog blocks (GSAP Standard License). |
| Kinetograph | Unverified | Ideas only, no code: values and frames recorded from the published Remotion package and compared numerically; the bundler alias with stubs for unsupported packages. Its licence could not be confirmed and its easing code has unattributed provenance. |
| Rendiv | Apache-2.0 | Ideas: readiness holds with a label and a timeout, `flushSync` frame setting, absolute frame indexing, an LRU with request deduplication for extracted video frames. |
| Revideo | MIT | Ideas: the decoder chosen per file, audio rendered once from the source files. |
| OpenMotion | MIT | What to avoid: fixed sleeps, a ready flag instead of tracked handles, no tests. |
| Remotion | Source-available, not open source | The shape of the public API, from its documentation only. |

Rules that follow from this:

- Ported code keeps its copyright header, the original licence and an entry in `NOTICE`, and says what was changed (Apache-2.0, section 4).
- Nobody working on this project reads Remotion's source, its type declarations (`.d.ts`) or its source maps. The oracle installs Remotion in `tools/oracle/`, outside the workspace and excluded from search and lint, and only calls its public API.
- Docs prose and type signatures are not copied word for word; the API shape is reproduced, the text is ours. "Remotion" appears only as nominative compatibility wording.
- Oracle recordings are produced by the project author as an individual, for this personal open-source project, under Remotion's free licence for individuals, at the pinned version. Recording on behalf of a company would need a Remotion company licence.

## Packages

A pnpm monorepo, ESM-only, TypeScript strict throughout, Node 22 or later for Node packages.

| Package | Runs in | Responsibility |
|---|---|---|
| `motio` | browser | The entry package, the equivalent of `remotion`: re-exports `@motiojs/core` and the media components. |
| `@motiojs/core` | browser | Timeline context and hooks (`useCurrentFrame`, `useVideoConfig`, `useCurrentScale`, `useBufferState`), `Sequence` (full prop set of the target), `Series`, `Loop`, `Freeze`, `AbsoluteFill`, `Composition`, `Still`, `Folder`, `registerRoot`, `getInputProps`, `calculateMetadata`, `interpolate`, `interpolateColors`, `spring`, `measureSpring`, `Easing`, `random`, `staticFile`, `getStaticFiles`, `prefetch`, readiness (`delayRender`, `continueRender`, `cancelRender`, `useDelayRender`), environment (`getRemotionEnvironment`). Pure and identical in the Player and in the renderer. No Node APIs. |
| `@motiojs/media` | browser | `Html5Video`, `OffthreadVideo` and `Html5Audio` (re-exported by `motio` with `Video` and `Audio` as their former names) and the `@remotion/media` `Video` and `Audio` at the package root (D-029); later `AnimatedImage` and `IFrame`. In preview they play native elements; when rendering they take frames from the host's media service and report their audio per frame (see "Media"). `Img` stays in core. |
| `@motiojs/player` | browser | `Player` and `Thumbnail`, with the documented ref API and events. Drives core with a real clock; `delayRender` is a no-op there, as in Remotion. |
| `@motiojs/bundler` | Node | Vite configuration for user projects: entry discovery, `public/` and `staticFile`, `remotion.config.ts` loading, env vars, the compat alias, React deduplication. `bundle()` for renders, `startDevServer()` for `motio dev`. |
| `@motiojs/preview` | browser | The `motio dev` page: the root's compositions, a `<Player>` with transport controls and a loop range, the props editor, the render check. React only, no UI framework. |
| `@motiojs/audio` | Node | The audio mixer: decodes sources with FFmpeg, mixes in float with sample-accurate offsets and per-frame volume, encodes once (D-014). |
| `@motiojs/video-frames` | Node | Source-frame selection from packet timestamps and exact extraction with FFmpeg, batched and cached (D-015). |
| `@motiojs/renderer` | Node | `bundle`, `getCompositions`, `selectComposition`, `renderMedia`, `renderStill`, `renderFrames`, `stitchFramesToVideo`. Owns the browser pool, the frame driver, capture, the media server, the audio mixer and the encoder. |
| `@motiojs/cli` | Node | `render`, `still`, `frames` (contact sheets), `compositions`, `dev`, `doctor`, `check determinism`, `check flicker`, `benchmark`, `browser ensure`. Positional forms and flags of the Remotion CLI; every command takes `--json`. Exit codes: 0 success, 1 error, 2 invalid arguments, 3 a check found problems. |
| `@motiojs/compat` | build | The alias plugin mapping `remotion` and `@remotion/*` to our packages, build-time failures for unsupported packages, `Config` for `remotion.config.ts`, and the compatibility report. |
| `@motiojs/distributed` | Node | Chunk planning, `renderDistributed()`, assembly, behind the `ChunkWorker` interface. `LocalChunkWorker` (child processes) today, adapters for AWS Lambda, Cloud Run and Kubernetes later. |
| Feature packages | browser | `transitions`, `captions`, `shapes`, `paths`, `noise`, `motion-blur`, `layout-utils`, `three`, `google-fonts`, `zod-types`, `tailwind`, later `lottie`, `gif`, `skia`, `rive`. Each mirrors the Remotion package of the same name. |
| `@motiojs/testing` | Node, dev only | Golden-frame comparison (PSNR, SSIM), frame-stamp decoding, determinism hashing, oracle fixture loading. |

Dependencies point one way: feature packages and `media` depend on `core`; `player` and `renderer` depend on `core` and never on each other; `cli` depends on `renderer` and `bundler`. A dependency-cruiser rule enforces it, including "no Node built-ins in browser packages".

## The page and the frame protocol

The renderer serves the built bundle over HTTP from a local server (ES modules do not load from `file://`). Before any page script runs, `Page.addScriptToEvaluateOnNewDocument` injects the run context: input props, environment variables, the protocol version, the frame seed and, in the virtual time model, the clock shim. `getInputProps()` can therefore be called at module top level.

**Bundle layout.** A user project has an entry file that calls `registerRoot(Root)`, where `Root` renders `<Composition>` and `<Still>` elements (the Remotion convention; the entry is found from `remotion.config.ts`, the CLI argument, or `src/index.ts(x)`). `@motiojs/bundler` builds with Vite a page whose module script imports the user entry and then calls `mountPage()` from `@motiojs/core/runtime`. `mountPage()` reads the run context, collects the registered compositions by rendering `Root` in collection mode, mounts the selected composition on `setComposition`, and installs the page API below. The output directory (`index.html`, assets, and the project's `public/` folder copied to `<outDir>/public`) is the `serveUrl` the renderer serves. Before the user entry runs, the page sets `globalThis.__motioBundle = { publicPath, staticBase, staticFiles, env }`, which `staticFile()`, `getStaticFiles()` and `process.env` read (`process.env` in user code is compiled to the `__MOTIO_ENV__` global; variables the renderer injects at run time win over build-time ones). `mountPage()` mounts into `#motio-root`. Like Remotion's Node API, `bundle()` does not read `remotion.config.ts`: the CLI loads it and passes the values in.

The page installs one versioned global:

```ts
window.__motio = {
  protocol: 1,
  getCompositions(): CompositionInfo[];
  setComposition(id: string, props: unknown): Promise<ResolvedComposition>; // runs calculateMetadata
  seek(frame: number): Promise<FrameReport>; // resolves when the frame is ready to capture
};
```

The renderer refuses a bundle whose protocol version it does not speak, with an error that names both versions.

`seek(frame)` does, in order:

1. In the virtual time model, sets the clock to the frame's time.
2. Renders the React tree for the frame inside `flushSync` and writes the frame number to `document.documentElement.dataset.motioFrame`. Passive effects of a sync render run before `flushSync` returns.
3. In the virtual time model, runs the timers and `requestAnimationFrame` callbacks due up to that time, each inside `flushSync`.
4. Seeks every CSS and Web Animation (`document.getAnimations()`), paused, to the time elapsed since the start of the nearest enclosing `Sequence`, read from a `data-motio-from` attribute that `Sequence` writes on its wrapper. This is deterministic in any order and needs no clock shim.
5. Settles: loops on real macrotasks until no readiness handle is open, no DOM mutation happened for two consecutive yields (MutationObserver), no `Suspense` fallback is mounted (the root boundary's fallback holds a readiness handle while mounted), `document.fonts.ready` resolved and every new image decoded. Updates scheduled on non-sync lanes (state set in effects, transitions, deferred values) are processed by React's own scheduler during these yields.
6. Returns a report: the frame number read back from the DOM, warnings (a font fell back to a system font, a handle was slow), the audio intents active on the frame, timings.

Readiness handles carry a label and a timeout measured on real time. On timeout `seek` rejects with the label and the frame. The renderer applies the documented `retries` behaviour: it closes the page, opens a fresh one and retries the frame. A watchdog in Node bounds every `seek` independently of the page, so a busy loop in user code cannot hang the render. `pageerror`, unhandled rejections and console output are forwarded to `onBrowserLog` and surface as errors with codes; `cancelRender` fails the render with the given error.

Frames are indexed absolutely from the first frame of the composition, so any page or worker can render any frame and completion order does not matter. Render bundles use React's production build, so StrictMode double effects never leak handles.

## Time

Two models, measured by the spike (see `DECISIONS.md`, D-005):

1. **Frame model (default).** `useCurrentFrame()` is the only source of truth, as in Remotion. No clock is patched. CSS and Web Animations are still seeked by `seek` step 4. Any frame can be rendered in any order on any page. The spike showed frame-driven components, state set in effects, CSS keyframes and Web Animations all give identical pixels across sequential, reverse, shuffled and fresh-page orders in this model.
2. **Virtual model (opt-in, `timeModel: "virtual"`).** For third-party code that reads the clock (GSAP, Lottie, canvas loops), a shim makes `Date`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame` and `Math.random` (reseeded per frame) follow the frame time. The spike showed clock reads (`Date.now`, `performance.now` in `requestAnimationFrame`, `Math.random`) become identical in every order, and React effects keep working. State accumulated by timers depends on history (a counter driven by `setInterval` depends on where the page started), so in this model each page renders a contiguous ascending range: the renderer warms up from the range start and reloads the page before any backward seek. `check determinism` detects code that still depends on history.

Shim rules: installed before any page script; never patches `MessageChannel`, `queueMicrotask`, `Promise`, `setImmediate` or `crypto.getRandomValues` (reseeding it would make id generators collide); keeps private references to the real timers, which the engine uses for readiness timeouts and settling. User timers do not advance while `seek` waits for readiness; code that waits on a timer before `continueRender` must use the frame model. Workers, iframes and `OffscreenCanvas` are outside the shim and documented as such. The Player never installs it.

## Capture

- **Browser.** `chrome-headless-shell` from Chrome for Testing at a pinned version (Linux x64 and arm64, macOS x64 and arm64), downloaded by `browser ensure` and verified against SHA-256 digests committed in the repo, because Chrome for Testing publishes none. Driven over CDP with `puppeteer-core`.
- **Flags** for identical pixels: `--font-render-hinting=none`, `--disable-lcd-text`, `--force-color-profile=srgb`, `--force-device-scale-factor=1`, `--disable-skia-runtime-opts`, `--disable-checker-imaging`, anti-throttling flags, `--disable-frame-rate-limit`, software GL through ANGLE and SwiftShader by default: opaque captures composite in software (`--disable-gpu-compositing`), transparent ones rasterise on the CPU and composite on SwiftShader (`--disable-gpu-rasterization`), which reproduces Remotion's pixels, the faint alpha of antialiased edges included (D-041). Hardware GPU is opt-in and gives up cross-machine identity.
- **Two capture paths.** `Page.captureScreenshot` always works, is the reference path and the default (`auto`). With frames drawn unthrottled (`--disable-frame-rate-limit`) and opaque captures composited in software, it captures a 1080p frame in about 10 ms on one page (D-041), as fast as BeginFrame, and pages can share a browser (D-042, D-043). BeginFrame (`--enable-begin-frame-control`, `--deterministic-mode`, Linux only, not officially supported by Chrome) stays available as `captureMethod: "begin-frame"`, with identical pixels (D-013, D-033) and one page per browser, because Chrome drives BeginFrame for one tab per browser. Before every capture the page reads its layout and waits for the images, fonts and style sheets that requested. On a BeginFrame page the renderer drives the compositor: frames without display updates while a page call runs (so `requestAnimationFrame` fires), then a pre-frame that runs style and layout and a wait for the images, fonts and style sheets it requested, then the captured frame.
- **Format.** PNG for alpha and for lossless output; JPEG for opaque output. The default (`jpeg`, quality 80, as in Remotion) is confirmed by the capture benchmark.
- **Background.** `Emulation.setDefaultBackgroundColorOverride`: transparent black for PNG captures with alpha, opaque black for JPEG, so what a composition leaves undrawn is black in an opaque video, as in Remotion (D-050).
- **Codecs.** One table maps each `codec` to its encoder, container, CRF range, pixel formats and audio codecs (D-037): H.264 (MP4, MKV, TS), H.265, VP8 and VP9 (WebM, alpha with `yuva420p`), ProRes (MOV, alpha with 4444), GIF (palette built from the whole clip in a separate pass). Image sequences are written by `renderFrames`.
- **Transport.** Frames stream to FFmpeg's stdin (`image2pipe`) through a reorder buffer, with backpressure. No frame files on disk except for `renderFrames`.
- **Pages.** A session keeps a pool of browsers; by default a render's pages are spread over two browsers (more above concurrency 8, four pages each), `pagesPerBrowser` chooses another layout (D-042). A page is recycled every N frames (a new tab on the same browser) and on crash; a crashed page's frames are retried on a fresh page, on a new browser if the browser crashed.

## Colour

RGB to YUV conversion is explicit, never FFmpeg's default (BT.601 for RGB input, full range for JPEG input):

- PNG frames (full-range RGB): `scale=in_range=pc:out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int`. JPEG frames (Chrome's full-range BT.601 YCbCr, 4:2:0): the `colorspace` filter converts matrix and range in YUV and keeps Chrome's chroma samples (D-040). Output tagged `-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv`.
- Remotion's `colorSpace` option (`default`, `bt709`, `bt2020-ncl`) is matched against the oracle.
- `yuv420p` requires even dimensions; odd sizes are rejected with a clear error, as Remotion does.
- A colour test encodes a known palette, decodes it back and requires every patch within 2 code values, and checks the tags with `ffprobe`.

## Media

- **Media service.** The renderer starts a local HTTP service per session and passes its URL to the page (`RunContext.mediaBaseUrl`). It answers media information, the exact source frame for a time (selected from packet timestamps, extracted with FFmpeg, batched and cached in an LRU with request deduplication, D-015) and where a native element must seek to show a frame. Media on the bundle's origin is read from the bundle directory, other http(s) media through FFmpeg (D-030).
- **Embedded video.** `OffthreadVideo` shows the extracted frame (`floor` rule) in an `<img>`, the `@remotion/media` `Video` draws it into a `<canvas>`, and both hold a readiness handle until it is displayed. The HTML5 `Video` keeps the native `<video>`, seeked to the middle of the frame the `nearest` rule picks and awaited on `seeked` (D-016), so refs and canvas drawing work. In the Player every component plays a native element on the real clock, synchronised to the Player's frame, volume, mute and rate through `MediaPlaybackContext`; `Html5Audio` borrows the Player's shared audio tags (D-029).
- **Audio.** Never captured from the browser. Each media component reports, on every frame it plays, the source position, rate, pitch, volume and stream (`FrameReport.audio`, protocol 2). The renderer collects them while capturing and seeks the frames the capture skips without capturing, so `frameRange`, `everyNthFrame` and audio-only codecs cannot drop audio; consecutive frames whose position advances by the rate form one segment. The mixer (`@motiojs/audio`) decodes sources to float PCM, applies sample-accurate offsets and per-frame volume in Node (D-014, D-028), and encodes once for the whole timeline, muxed into the MP4 in the same FFmpeg run or written alone for `mp3`, `aac` and `wav` (D-030). Pitch uses `asetrate` and `atempo`, available in common FFmpeg builds.
- **Fonts.** Loaded from files or Google Fonts and awaited before every frame. Text that fell back to a system font is reported.
- **Animated images** (`<img>` with GIF or WebP) run on real time in Chrome; `AnimatedImage` and `Gif` are the frame-accurate components.

## Parallel and distributed rendering

- **One machine.** A pool of pages across browser processes (two by default, D-042) pulling frame numbers from a shared queue (contiguous ranges in the virtual time model), all feeding one encoder. Default concurrency: half the CPU threads, capped at 8, as in Remotion.
- **Many machines.** `renderDistributed()` plans the timeline into chunks; workers run `renderChunk()` and encode each chunk on its own (MPEG-TS for H.264 and H.265, WebM for VP8 and VP9, MOV for ProRes), starting on a keyframe; meanwhile `renderAudio()` renders the audio once as float samples; the assembler concatenates without re-encoding (D-018) and encodes the audio in the same run, as `renderMedia` does (D-039). Workers implement one method, `ChunkWorker.renderChunk(job)` with a JSON job: `LocalChunkWorker` runs a child process per chunk, and Lambda, Cloud Run and Kubernetes are adapters to write.

## Preview

`motio dev [entry]` starts a Vite dev server (`startDevServer()` in `@motiojs/bundler`, with the settings of `bundle()` plus React Fast Refresh for the project's files) on `--port`, `Config.setStudioPort()` or 3000, and serves the `@motiojs/preview` page. The page renders the root with no composition selected, so every `<Composition>` registers as on the render page, and lists them; the selection lives in the URL hash. The selected composition plays in `<Player controls>` after core's `resolveComposition()` ran `calculateMetadata()` with the props from the JSON editor (checked against the schema, as warnings). Transport: play, scrub, step a frame or a second, jump to the ends, loop an in/out range, rate, zoom, frame counter and timecode, with keyboard shortcuts. A component edit hot-reloads in place; any other edit reloads the page, which restores the frame, range and props from `sessionStorage`. The stage resets inherited CSS, so the composition lays out as on the bare render page.

"Render still" asks the dev server to render the current frame through the real pipeline (`motio still` semantics): the CLI hands the server a handler that rebuilds a production bundle after a source change, runs `selectComposition` with the page's props and `renderStill` as PNG. The page shows the image and can overlay it on the Player with a difference blend. `--json` prints one object when the server listens (URL, port, entry, pid) and nothing after; SIGINT and SIGTERM stop the server and remove the session's files (D-026).

## Compatibility

- **Drop-in.** The `@motiojs/compat` Vite plugin resolves `remotion` and `@remotion/<pkg>` to our packages and fails the build on an unsupported package, with the package name and the alternative. `remotion.config.ts` loads through a `Config` object with the documented setters. Environment variables follow Remotion's rules (`.env` and `REMOTION_`-prefixed variables exposed through `process.env`) through Vite `define`. `doctor` lists every symbol a project uses with its manifest status.
- **Proof.** For every pure function, fixtures record the outputs of the published package at the target version, produced by `tools/oracle`. For components, effects and templates, the oracle renders reference stills and videos, and ours must match within the thresholds in `ROADMAP.md`. Fixtures and goldens change only through an explicit record command, in separate commits that state why.

## API surface, in tiers

Prioritised by the common use cases and by npm downloads of the feature packages.

- **Tier 1 (v1).** Core as listed in "Packages". Media: `Img`, `Video`, `OffthreadVideo`, `Audio`, fonts, `@remotion/media` `Video` and `Audio`. Player. Renderer API and CLI with the common options (`codec`, `crf`, `imageFormat`, `jpegQuality`, `everyNthFrame`, `frameRange`, `concurrency`, `scale`, `pixelFormat`, `colorSpace`, `x264Preset`, `audioCodec`, `muted`, `chromiumOptions`, `timeoutInMilliseconds`, `cancelSignal`, `onBrowserLog`, `onProgress`). `remotion.config.ts`. Transitions. Captions. Google Fonts. Zod schemas. Tailwind.
- **Tier 2.** `shapes`, `paths`, `noise`, `motion-blur`, `layout-utils`, `animation-utils`, `three`, `media-utils`, distributed rendering, alpha output (WebM VP9, ProRes 4444), GIF output, effects.
- **Tier 3.** `lottie`, `gif` input, `skia`, `rive`, transcription adapters, client-side rendering, a Studio.

## Testing

- **Unit** (Vitest, Node): every pure function against the oracle fixtures.
- **Core components** (Vitest, jsdom): timeline semantics of `Sequence`, `Series`, `Loop`, `Freeze`, `useVideoConfig`.
- **Integration** (Vitest, serial, real pinned Chrome and FFmpeg): the frame protocol, frame-stamp fixtures (the frame number encoded as a pixel barcode, decoded from every captured frame), React fixtures (`delayRender` in an effect, `setState` in an effect, `useDeferredValue`, lazy and `Suspense`), colour, encoder output checked with `ffprobe`.
- **Golden frames**: fixture compositions and templates compared with the oracle (PSNR, SSIM) and with our own goldens.
- **Determinism**: `motio check determinism` renders a range in several orders and concurrencies and compares decoded frame hashes.
- **Flicker**: `motio check flicker` flags frames that differ from both neighbours beyond a threshold.
- **Player**: jsdom component tests and real-browser tests in the pinned chrome-headless-shell driven by puppeteer-core: ref API, events, real-clock playback, buffering (D-022).

## Delivery plan

Milestones, with measurable done criteria, live in `ROADMAP.md`. Order: spike, M1 single-node render, M2 compat breadth (Tier 1 graphics and config), M3 media and Player, M4 a real production project, M5 scale and formats.

## Decisions

Recorded with their reasons in `DECISIONS.md`: licence (Apache-2.0), FFmpeg as a system dependency, Vite as bundler, the name, the time model, the capture defaults, the tooling.
