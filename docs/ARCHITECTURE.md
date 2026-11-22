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
| `@motiojs/media` | browser | `Img`, `Video`, `OffthreadVideo`, `Audio`, `AnimatedImage`, `IFrame`, font loading. In preview they use the native elements; when rendering they take frames and audio from the host (see "Media"). |
| `@motiojs/player` | browser | `Player` and `Thumbnail`, with the documented ref API and events. Drives core with a real clock; `delayRender` is a no-op there, as in Remotion. |
| `@motiojs/bundler` | Node | Vite configuration for user projects: entry discovery, `public/` and `staticFile`, `remotion.config.ts` loading, env vars, the compat alias, React deduplication. Used by `dev` and by `bundle`. |
| `@motiojs/audio` | Node | The audio mixer: decodes sources with FFmpeg, mixes in float with sample-accurate offsets and per-frame volume, encodes once (D-014). |
| `@motiojs/video-frames` | Node | Source-frame selection from packet timestamps and exact extraction with FFmpeg, batched and cached (D-015). |
| `@motiojs/renderer` | Node | `bundle`, `getCompositions`, `selectComposition`, `renderMedia`, `renderStill`, `renderFrames`, `stitchFramesToVideo`. Owns the browser pool, the frame driver, capture, the media server, the audio mixer and the encoder. |
| `@motiojs/cli` | Node | `render`, `still`, `frames` (contact sheets), `compositions`, `dev`, `doctor`, `check determinism`, `check flicker`, `benchmark`, `browser ensure`. Positional forms and flags of the Remotion CLI; every command takes `--json`. |
| `@motiojs/compat` | build | The alias plugin mapping `remotion` and `@remotion/*` to our packages, build-time failures for unsupported packages, `Config` for `remotion.config.ts`, and the compatibility report. |
| `@motiojs/distributed` | Node | Chunk planning, chunk rendering, assembly, behind a worker interface. Local processes first, adapters for AWS Lambda, Cloud Run and Kubernetes later. |
| Feature packages | browser | `transitions`, `captions`, `shapes`, `paths`, `noise`, `motion-blur`, `layout-utils`, `three`, `google-fonts`, `zod-types`, `tailwind`, later `lottie`, `gif`, `skia`, `rive`. Each mirrors the Remotion package of the same name. |
| `@motiojs/testing` | Node, dev only | Golden-frame comparison (PSNR, SSIM), frame-stamp decoding, determinism hashing, oracle fixture loading. |

Dependencies point one way: feature packages and `media` depend on `core`; `player` and `renderer` depend on `core` and never on each other; `cli` depends on `renderer` and `bundler`. A dependency-cruiser rule enforces it, including "no Node built-ins in browser packages".

## The page and the frame protocol

The renderer serves the built bundle over HTTP from a local server (ES modules do not load from `file://`). Before any page script runs, `Page.addScriptToEvaluateOnNewDocument` injects the run context: input props, environment variables, the protocol version, the frame seed and, in the virtual time model, the clock shim. `getInputProps()` can therefore be called at module top level.

**Bundle layout.** A user project has an entry file that calls `registerRoot(Root)`, where `Root` renders `<Composition>` and `<Still>` elements (the Remotion convention; the entry is found from `remotion.config.ts`, the CLI argument, or `src/index.ts(x)`). `@motiojs/bundler` builds with Vite a page whose module script imports the user entry and then calls `mountPage()` from `@motiojs/core/runtime`. `mountPage()` reads the run context, collects the registered compositions by rendering `Root` in collection mode, mounts the selected composition on `setComposition`, and installs the page API below. The output directory (`index.html`, assets, the copied `public/` folder) is the `serveUrl` the renderer serves.

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
- **Flags** for identical pixels: `--font-render-hinting=none`, `--disable-lcd-text`, `--force-color-profile=srgb`, `--force-device-scale-factor=1`, `--disable-skia-runtime-opts`, `--disable-checker-imaging`, anti-throttling flags, software GL through ANGLE and SwiftShader by default. Hardware GPU is opt-in and gives up cross-machine identity.
- **Two capture paths.** `Page.captureScreenshot` always works and is the reference path. BeginFrame (`--enable-begin-frame-control`, `--deterministic-mode`) is an optimisation probed at start-up, used only where it works (Linux); it is not officially supported by Chrome.
- **Format.** PNG for alpha and for lossless output; JPEG for opaque output. The default (`jpeg`, quality 80, as in Remotion) is confirmed by the capture benchmark.
- **Alpha.** `Emulation.setDefaultBackgroundColorOverride` with transparent black, PNG only.
- **Transport.** Frames stream to FFmpeg's stdin (`image2pipe`) through a reorder buffer, with backpressure. No frame files on disk except for `renderFrames`.
- **Pages.** A page is recycled every N frames and on crash; a crashed page's frames are retried on a fresh page.

## Colour

RGB to YUV conversion is explicit, never FFmpeg's default (BT.601 for RGB input, full range for JPEG input):

- `scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int` with input range set per format (PNG and JPEG decode to different pixel formats), output tagged `-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv`.
- Remotion's `colorSpace` option (`default`, `bt709`, `bt2020-ncl`) is matched against the oracle.
- `yuv420p` requires even dimensions; odd sizes are rejected with a clear error, as Remotion does.
- A colour test encodes a known palette, decodes it back and requires every patch within 2 code values, and checks the tags with `ffprobe`.

## Media

- **Embedded video.** Decoded outside the browser with FFmpeg into the exact source frame for each composition frame (the selection rule for frame rate conversion, `playbackRate` and trim is recorded from the oracle), cached in an LRU with request deduplication, served through `Fetch` interception limited to a synthetic origin's URL pattern. During render the `<video>` element shows the extracted frame; a ref to the element still yields a drawable element (the design is part of M2, because user code draws video refs onto canvases). In the Player the native `<video>` plays.
- **Audio.** Never captured from the browser. The timeline of audio intents (source, start, trim, playback rate, pitch, volume per frame) is collected by a dedicated pass that seeks every frame without capturing, so `frameRange`, `everyNthFrame` and chunking cannot drop intents. The mixer (`@motiojs/audio`) decodes sources to float PCM, applies sample-accurate offsets and per-frame volume in Node, and encodes once for the whole timeline. Pitch uses `asetrate` and `atempo`, available in common FFmpeg builds.
- **Fonts.** Loaded from files or Google Fonts and awaited before every frame. Text that fell back to a system font is reported.
- **Animated images** (`<img>` with GIF or WebP) run on real time in Chrome; `AnimatedImage` and `Gif` are the frame-accurate components.

## Parallel and distributed rendering

- **One machine.** A pool of pages across one or more browser processes pulling frame numbers from a shared queue (contiguous ranges in the virtual time model), all feeding one encoder. Default concurrency: half the CPU threads, capped at 8, as in Remotion.
- **Many machines.** The planner cuts the timeline into chunks; workers encode chunks as MPEG-TS with closed GOPs; the assembler concatenates without re-encoding (D-018), remuxes to the container and muxes the audio rendered once. Workers sit behind three operations (plan, render chunk, assemble), so local processes, Lambda, Cloud Run and Kubernetes are adapters.

## Preview

`motio dev` starts the Vite dev server with a page built on the Player: play, scrub, step one frame, loop a range, reload on save, choose the composition and its props. For "is this frame exactly what the render will be", `motio still` renders the frame through the real pipeline.

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
- **Player**: Playwright, ref API and events.

## Delivery plan

Milestones, with measurable done criteria, live in `ROADMAP.md`. Order: spike, M1 single-node render, M2 compat breadth (Tier 1 graphics and config), M3 media and Player, M4 a real production project, M5 scale and formats.

## Decisions

Recorded with their reasons in `DECISIONS.md`: licence (Apache-2.0), FFmpeg as a system dependency, Vite as bundler, the name, the time model, the capture defaults, the tooling.
