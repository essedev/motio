# Architecture

Status: draft for discussion, 2026-11-21. Nothing here is implemented yet. The project is called Motio: the unscoped `motio` package is the entry point (the equivalent of `remotion`), the other packages live under `@motiojs/*` because the `@motio` scope is taken on npm.

## What this is

An open-source framework for making videos with React. A video is a React tree that is a pure function of the frame number. The engine renders it in a real headless Chrome, captures it one frame at a time and encodes it with FFmpeg.

The public API is compatible with Remotion's documented API, so existing Remotion projects can move over by changing their imports, or with no change at all through the bundler alias. The engine is written from scratch: it uses Remotion's documentation and observable behaviour, never its source code.

## Goals

1. **Fidelity.** The pixels are the ones Chrome draws. There is no reimplementation of CSS, layout or text: if it looks right in Chrome, it renders right.
2. **Determinism.** The same project, props and frame number give the same pixels, on every run and in any order. On a pinned Chrome with software GL, the same holds across machines. This is enforced by tests, not assumed.
3. **Compatibility.** Remotion's public API, in tiers (see "API surface"). Every compatible symbol is checked against values and frames recorded from the published Remotion package.
4. **Agent-first tooling.** Every command has machine-readable output (`--json`), clear errors with codes, and commands that let an agent check its own work without watching a video: stills, contact sheets, flicker and determinism checks, a compatibility report.
5. **Complete for most use cases.** Data-driven videos at scale, captions, social clips, product demos, audio visualisers, embedded players and video editors built on the Player, automated and distributed rendering.
6. **Free for any use.** A permissive licence with no per-render or per-seat fee, including distributed rendering and embedding the Player in a product.

## Non-goals for v1

- **A Studio editor.** The value of a Studio is mostly watching motion while editing, and a `dev` preview page built on the Player covers that (see "Preview"). Editing props in forms, timelines and render queues serve people who do not write code. A Studio can be built on the Player later without touching the engine.
- **A browserless renderer.** That is the opposite trade-off (speed over fidelity), already explored by other projects.
- **Client-side rendering with WebCodecs.** It renders a subset of CSS and tags. It is a later tier.
- **A hosted cloud service.** Distributed rendering ships as a library and adapters for the user's own infrastructure.

## Prior art and what we take from it

| Project | Licence | What we take |
|---|---|---|
| HyperFrames (HeyGen) | Apache-2.0 | The capture pipeline is the closest to ours and actively maintained: pinned `chrome-headless-shell` with a known set of determinism flags, the virtual-time shim, BeginFrame capture on Linux with screenshot fallback elsewhere, video frames extracted by FFmpeg outside the browser and served through request interception, the FFmpeg audio filter graph, the streaming encoder with a reorder buffer, GOP-locked chunks for distributed rendering. Code may be ported with its licence and NOTICE. Not its catalog blocks (GSAP Standard License, not open source). |
| Kinetograph | Apache-2.0 | The method for proving compatibility: values and frames recorded from the published Remotion package, compared numerically (PSNR, SSIM). The bundler alias that maps `remotion` and `@remotion/*` imports and replaces unsupported packages with a stub that says what is missing. Its renderer is browserless, so the rest does not transfer. |
| Rendiv | Apache-2.0 | Readiness holds with a label and a timeout, frames set synchronously with `flushSync`, frames indexed absolutely so several pages write into one output without concatenation, an LRU cache with request deduplication for extracted video frames. |
| Revideo | MIT | Choosing the video decoder per file, rendering audio once from the source files instead of capturing it. |
| OpenMotion | MIT | Mostly what to avoid: fixed sleeps, a ready flag instead of tracked handles, no tests. |
| Remotion | Source-available, not open source | Ideas and the shape of the public API, from its documentation only. Never its code. |

Rules that follow from this:

- Ported code keeps its copyright header, the original licence and an entry in `NOTICE`, and says what was changed (Apache-2.0, section 4).
- Nobody working on this project reads Remotion's source. Compatibility comes from the docs and from black-box recordings of the published package.
- Kinetograph's `easing.ts` says it derives from React Native's easing without attribution. We write our easing from the public formulas instead of porting it.

## Packages

A pnpm monorepo, TypeScript strict throughout.

| Package | Runs in | Responsibility |
|---|---|---|
| `@motiojs/core` | browser | Timeline context and hooks (`useCurrentFrame`, `useVideoConfig`), `Sequence`, `Series`, `Loop`, `Freeze`, `AbsoluteFill`, `Composition`, `Still`, `Folder`, `registerRoot`, input props, `calculateMetadata`, `interpolate`, `interpolateColors`, `spring`, `measureSpring`, `Easing`, `random`, `staticFile`, readiness (`delayRender`, `continueRender`, `cancelRender`, `useDelayRender`), environment (`getRemotionEnvironment`). Pure and identical in the Player and in the renderer. |
| `@motiojs/media` | browser | `Img`, `Video`, `OffthreadVideo`, `Audio`, `AnimatedImage`, `IFrame`, font loading. In preview they use the native elements; when rendering they take frames and audio from the host (see "Media"). |
| `@motiojs/player` | browser | `Player` and `Thumbnail` for embedding in a web app, with the documented ref API and events. Drives `@motiojs/core` with a real clock. |
| `@motiojs/renderer` | Node | Programmatic API: `bundle`, `getCompositions`, `selectComposition`, `renderMedia`, `renderStill`, `renderFrames`, `stitchFramesToVideo`. Owns the browser pool, the frame driver, capture, the media server, the audio mixer and the encoder. |
| `@motiojs/cli` | Node | `render`, `still`, `frames` (contact sheets), `compositions`, `dev`, `doctor`, `check determinism`, `check flicker`, `benchmark`, `browser ensure`. Every command takes `--json`. |
| `@motiojs/compat` | build | The bundler plugin that maps `remotion` and `@remotion/*` to our packages, and the compatibility report used by `doctor`. |
| `@motiojs/distributed` | Node | Chunk planning, chunk rendering, assembly, behind a small worker interface. Local processes first, adapters for AWS Lambda, Cloud Run and Kubernetes later. |
| Feature packages | browser | `transitions`, `captions`, `shapes`, `paths`, `noise`, `motion-blur`, `layout-utils`, `three`, `google-fonts`, `zod-types`, later `lottie`, `gif`, `skia`, `rive`. Each mirrors the Remotion package of the same name. |
| `@motiojs/testing` | Node, dev only | The oracle harness (recordings from published Remotion), golden-frame comparison, determinism hashing. |

The dependency direction is one way: feature packages and `media` depend on `core`; `player` and `renderer` depend on `core` and never on each other; `cli` depends on `renderer`. Nothing in `core` imports Node APIs.

## The frame protocol

This is the centre of the engine. The renderer and the page talk through one object the page installs:

```ts
window.__ve = {
  getCompositions(): CompositionInfo[];
  setComposition(id: string, props: unknown): Promise<ResolvedComposition>; // runs calculateMetadata
  seek(frame: number): Promise<FrameReport>; // resolves when the frame is ready to capture
};
```

`seek(frame)` does, in order:

1. Sets the virtual clock to the frame's time (see "Time").
2. Renders the React tree for that frame synchronously with `flushSync`, then flushes the effects the render scheduled.
3. Runs virtual timers and `requestAnimationFrame` callbacks due up to that time.
4. Seeks every CSS and Web Animation in the document to that time, paused (`document.getAnimations()`).
5. Waits for readiness: no `delayRender` handle open, `document.fonts.ready`, every new image decoded, every video frame for this time injected. Each open handle has a label and a timeout; a timeout rejects `seek` with the label, so the renderer reports which component hung and on which frame.
6. Returns a report: warnings (for example a font fell back to a system font), the audio intents active on this frame, timings.

Then the renderer captures. Frames are indexed absolutely from the first frame of the composition, so any page or worker can render any frame and the order of completion does not matter.

## Time

Two layers, and their relationship is the main thing the first spike has to settle.

1. **The frame from the hook.** `useCurrentFrame()` is the source of truth, exactly as in Remotion. Code written this way is deterministic by construction.
2. **A virtual clock for everything else.** In render mode, before any user code runs, a shim makes `Date`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `Math.random` (seeded per frame) and `crypto.getRandomValues` follow the frame time. This is what makes third-party code that reads the clock (GSAP, Lottie, CSS animations, canvas libraries) render the right frame without changes.

The known risk: React's scheduler and some libraries use timers and `MessageChannel` internally. Patching timers can change when effects run. HyperFrames and Kinetograph patch the clock, Rendiv does not. The spike measures both with the determinism check on a set of fixtures (React state with effects, CSS keyframes, GSAP timelines, three.js) before the choice is fixed. The Player never installs the shim: preview runs on the real clock.

## Capture

- **Browser.** `chrome-headless-shell` from Chrome for Testing, at a pinned version, downloaded by `browser ensure` and verified by digest. Driven over CDP with `puppeteer-core`: it exposes the raw protocol we need (`HeadlessExperimental.beginFrame`, `Fetch`) without bundling its own browser builds.
- **Flags** for identical pixels across machines: `--font-render-hinting=none`, `--disable-lcd-text`, `--force-color-profile=srgb`, `--force-device-scale-factor=1`, anti-throttling flags, and software GL through ANGLE and SwiftShader by default. Hardware GPU is opt-in, and gives up cross-machine identity for speed.
- **Two capture modes.** BeginFrame (`--enable-begin-frame-control`, `--deterministic-mode`) where it works, which today means Linux; `Page.captureScreenshot` elsewhere. BeginFrame is an optimisation and is not officially supported by Chrome, so the screenshot path must always work and the renderer probes BeginFrame support on start-up.
- **Format.** PNG when the output has alpha or for final quality, JPEG at high quality for drafts. The default for opaque final renders is decided by the capture benchmark (speed against a measurable loss before encoding).
- **Transport.** Captured frames stream to FFmpeg's stdin (`image2pipe`) through a reorder buffer, with backpressure. No frame files on disk except for `renderFrames`.

## Media

- **Embedded video.** Decoded outside the browser with FFmpeg into exact frames for each composition frame, cached in an LRU with request deduplication, and served to the page through `Fetch` interception on a synthetic origin, not as data URIs. During render the `<video>` element is replaced by the frame. In the Player, the native `<video>` plays. The decoder can be chosen per file; in-page decoding with WebCodecs is the alternative to benchmark.
- **Audio.** Never captured from the browser. Components declare audio intents (source, start, trim, volume per frame, playback rate, pitch), collected from the frame reports. After the frames, the mixer builds one FFmpeg filter graph from the source files (`atrim`, `adelay`, keyframed `volume`, `atempo`, `amix` with `normalize=0`) for the whole timeline, and the result is muxed once. Audio is never encoded per chunk, which avoids seams and encoder priming offsets at chunk boundaries.
- **Fonts.** Loaded from files or Google Fonts and awaited before every frame. The engine reports any text that fell back to a system font, because system fonts differ between machines.
- **Generated audio** (Web Audio graphs built by the project) renders offline in a later tier.

## Parallel and distributed rendering

- **One machine.** A pool of pages across one or more browser processes, each pulling frame numbers from a shared queue, all feeding one encoder. The default concurrency comes from `benchmark`.
- **Many machines.** The planner cuts the timeline into chunks that each start on a keyframe (closed GOP), workers render chunks to video-only files, and the assembler concatenates them without re-encoding and muxes the audio rendered once. Workers sit behind an interface with three operations (plan, render chunk, assemble), so local processes, AWS Lambda, Cloud Run and Kubernetes are adapters, not forks.

## Preview

`motio dev` starts a Vite dev server with a page built on the Player: play, scrub, step one frame, loop a range, reload on save, choose the composition and its props. It shows the same React tree the renderer shows, on the real clock. For "is this frame exactly what the render will be", `motio still` renders the frame through the real pipeline.

## Compatibility

- **Drop-in.** The `@motiojs/compat` bundler plugin resolves `remotion` and `@remotion/<pkg>` to our packages. An unsupported package resolves to a stub that fails at import with the package name and the alternative. `motio doctor` lists every Remotion symbol a project uses and whether it is supported, approximated or missing.
- **Proof.** For every pure function, a fixture file records outputs of the published Remotion package at a pinned version, produced by a script that installs that version in an isolated directory and calls only its public API. For components and effects, the same script renders reference stills, and our renders must match within a set PSNR and SSIM threshold. Recordings are regenerated when we move the pinned version.

## API surface, in tiers

Prioritised by what the common use cases need and by npm downloads of the feature packages. Download counts of core packages are inflated by transitive installs, so they weigh less.

- **Tier 1 (v1).** Core: `Composition`, `Still`, `Folder`, `Sequence`, `Series`, `Loop`, `Freeze`, `AbsoluteFill`, the hooks, `interpolate`, `interpolateColors`, `spring`, `Easing`, `random`, `staticFile`, readiness, `calculateMetadata`, input props, `registerRoot`. Media: `Img`, `Video`, `OffthreadVideo`, `Audio`, fonts, `@remotion/media` `Video` and `Audio`. Player. Renderer API and CLI. Transitions (`TransitionSeries` and the common presentations). Captions (SRT and VTT import, TikTok-style display). Google Fonts. Zod schemas for props.
- **Tier 2.** `shapes`, `paths`, `noise`, `motion-blur`, `layout-utils`, `animation-utils`, `three`, Tailwind setup, `media-utils` (`getAudioData`, `visualizeAudio`), distributed rendering and its adapters, alpha output (WebM VP9, ProRes 4444), GIF output, `HtmlInCanvas` and effects.
- **Tier 3.** `lottie`, `gif` (input), `skia`, `rive`, transcription adapters (Whisper, OpenAI, ElevenLabs), client-side rendering, a Studio.

## Testing

- Unit tests on every pure function against the oracle fixtures.
- Golden frames: fixture compositions rendered and compared with the Remotion reference stills and with our own goldens.
- Determinism: `motio check determinism` renders a range twice, in different orders and concurrencies, and compares frame hashes. It runs in CI on Linux and macOS.
- Flicker: `motio check flicker` flags frames that differ from both neighbours by more than a threshold, the usual sign of a readiness race.
- End to end: example projects rendered in CI with the pinned browser.

## Delivery plan

1. **Spike** (days). The frame protocol, the two time layers on the fixture set, BeginFrame against screenshot capture, PNG against JPEG. Output: the numbers that fix the open choices above.
2. **M1, single-node render.** Core, `Img`, fonts, readiness, the renderer to H.264 MP4, `render`, `still`, `frames`, the compat alias. Done when a set of Remotion examples renders within threshold of the Remotion reference.
3. **M2, media and preview.** Video extraction, the audio mixer, the Player, `dev`.
4. **M3, a real production project.** Every video of a production Remotion project renders with no source changes and passes the flicker check and a frame comparison against its Remotion render.
5. **M4, the rest of Tier 1 and Tier 2 graphics.** Transitions, captions, shapes, paths, noise, motion blur, three, Google Fonts, Zod.
6. **M5, scale and formats.** Distributed rendering with the local and Lambda adapters, alpha, GIF.

## Decisions

1. **Licence: Apache-2.0.** It matches the code we port and adds a patent grant.
2. **FFmpeg: a system dependency, not bundled.** The engine runs the `ffmpeg` and `ffprobe` found on `PATH` (or set in config) as separate processes, so its licence never reaches our packages. `doctor` and every render check a minimum version and the encoders the output needs (`libx264` for H.264, `libvpx-vp9` for WebM, `prores_ks` for ProRes), and the render metadata records the version used. Reproducibility comes from the official container image and the cloud adapters, which pin one FFmpeg build; determinism tests run in that image. We ship no binary on npm: the common static builds are GPL because of x264, redistributing them from an Apache-2.0 package means carrying GPL obligations, and `libfdk_aac` cannot be redistributed at all, so the default AAC encoder is FFmpeg's native one. A pinned download can be added later as an opt-in package without changing the engine.
3. **Bundler: Vite.** One tool for the dev page and the render bundle (`vite build` to static files served to Chrome), a plugin API that fits the compat alias, and the standard in the React ecosystem. Remotion's `webpackOverride` has no equivalent: the migration guide maps the common overrides (Tailwind, SVGR, MDX, path aliases) to Vite plugins, and `doctor` flags a project that defines one.
4. **Name: Motio.** Entry package `motio`, CLI `motio`, scope `@motiojs/*`.

## Open decisions

1. **Time model** (see "Time"). Decided by the spike.
2. **Oracle recordings.** Recording values from the published Remotion package means running it. That is free for an individual or a team of up to three people under Remotion's licence; the recordings must be made under a licence that allows it.
