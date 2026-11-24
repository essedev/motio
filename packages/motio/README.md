# @motiojs/motio

The entry package of [Motio](../../README.md): make videos with React. A video is a React component that draws one frame at a time; Motio tells it which frame to draw, takes a screenshot in a pinned headless Chrome and encodes the screenshots with FFmpeg. The components, hooks and functions are compatible with Remotion's documented API: `@motiojs/motio` exposes the same names as `remotion`.

A new project, with the CLI, a starter and notes for coding agents (`AGENTS.md`):

```bash
pnpm create motio my-video
```

In an existing project:

```bash
pnpm add @motiojs/motio react react-dom
pnpm add -D @motiojs/cli
```

## A frame is a function of its number

<!-- example: ../../docs/guide/examples/src/frames.tsx#clock -->
```tsx
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "@motiojs/motio";

export const Clock = () => {
	const frame = useCurrentFrame();
	const { fps, durationInFrames, width, height } = useVideoConfig();
	const seconds = frame / fps;
	return (
		<AbsoluteFill style={{ justifyContent: "center", alignItems: "center", fontSize: 64 }}>
			Frame {frame} of {durationInFrames} ({seconds.toFixed(2)} s) at {width}x{height}
		</AbsoluteFill>
	);
};
```

`src/index.ts` registers a root with `registerRoot(Root)`, and the root declares each video with `<Composition id component width height fps durationInFrames />`. `motio dev src/index.ts` previews it, `motio render src/index.ts <id> out/video.mp4` renders it.

## Rules for a deterministic render

Frames are rendered in any order, in several browser tabs at once, and a failed frame is retried on a fresh tab. The pixels of a frame must depend only on its number and the props:

- Derive every moving value from `useCurrentFrame()`, with `interpolate()` and `spring()`.
- CSS transitions, `setTimeout`, `setInterval`, `requestAnimationFrame` loops and `Date.now()` run on real time and give different pixels on every render. CSS `@keyframes` animations are seeked to the frame's time and are fine.
- Keep no state between frames; use `random(seed)` instead of `Math.random()`.
- These rules are for the default frame time model. For a library that runs on its own clock (GSAP, a canvas loop on `requestAnimationFrame`, `setInterval`, `Date`), `<Composition timeModel="virtual">` or `--time-model=virtual` makes `Date`, `performance.now()`, timers, `requestAnimationFrame` and `Math.random()` follow the frame: every tab steps through each frame from frame 0, so renders cost more the later a tab starts, and `motio dev` keeps the real clock (see [Code that reads the clock](../../docs/guide/frames-and-time.md#code-that-reads-the-clock)).
- Hold anything asynchronous with `delayRender()` and release it with `continueRender(handle)`.
- To show your product's UI, rebuild its screens and share pure data with the product (tokens, copy, icons, sample records) instead of importing its components.

`motio check determinism` renders the frames in two orders and with two numbers of tabs, compares the decoded pixels and names the likely cause of a difference.

## Entry points

- `@motiojs/motio`: components, hooks and functions.
- `@motiojs/motio/no-react`: `interpolate()` and `random()` without loading React.
- `@motiojs/motio/version`: `VERSION`, and the Remotion API version Motio implements.
- `@motiojs/motio/client`: types for the files a project imports through the bundler (images, fonts, `?raw`, CSS modules), listed in `tsconfig.json` under `"types"`.
- `@motiojs/motio/config`: `defineConfig()` and the types of `motio.config.ts` (see [Configuration](../../docs/guide/configuration.md)).
- `@motiojs/motio/remotion`: the target of the compatibility alias for `remotion`.

## Documentation

The [guide](../../docs/guide/README.md) starts from [Getting started](../../docs/guide/getting-started.md); [Frames and time](../../docs/guide/frames-and-time.md) and [Readiness](../../docs/guide/readiness.md) explain the rules above. `useCurrentFrame()`, `delayRender()`, `<Composition>` and `staticFile()` repeat these rules in their doc comments, which editors and agents read from the type declarations. Every `motio` command takes `--help`, and `--json` for scripts and agents.
