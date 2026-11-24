# Frames and time

A video is a sequence of still images, the frames, shown at a fixed rate: 30 frames per second (fps) means frame 30 is shown at one second. In Motio a component never asks what time it is. It asks which frame it is drawing, with `useCurrentFrame()`, and returns what that frame looks like:

<!-- example: examples/src/frames.tsx#clock -->
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

`useVideoConfig()` gives the composition's `fps`, `durationInFrames`, `width`, `height`, `id`, and its props. Time in seconds is `frame / fps`; a duration of 4 seconds at 30 fps is 120 frames, numbered 0 to 119.

## Why frames and not time

Motio renders a frame by setting the frame number, waiting until the page is ready, and taking a screenshot. Several browser tabs render different frames at the same time, in whatever order is fastest, and a failed frame is retried on a fresh tab. That only works if the pixels of a frame depend on nothing but its number and the props. So:

- Derive every moving value from `useCurrentFrame()`: positions, opacities, which word is highlighted.
- Do not keep animation state between frames (a counter incremented in an effect, a value accumulated in a ref): frame 50 may be the first frame a tab ever renders.
- Do not use `Math.random()`. `random(seed)` returns the same number for the same seed everywhere:

<!-- example: examples/src/frames.tsx#random -->
```tsx
import { AbsoluteFill, random, useVideoConfig } from "@motiojs/motio";

export const Stars = () => {
	const { width, height } = useVideoConfig();
	// random(seed) returns the same number between 0 and 1 for the same seed, on every frame,
	// page and machine. Math.random() would change on every render.
	const stars = Array.from({ length: 50 }, (_, i) => ({
		x: random(`x-${i}`) * width,
		y: random(`y-${i}`) * height,
	}));
	return (
		<AbsoluteFill style={{ backgroundColor: "black" }}>
			{stars.map((star, i) => (
				<div
					key={`${star.x}-${star.y}`}
					style={{
						position: "absolute",
						left: star.x,
						top: star.y,
						width: 3,
						height: 3,
						borderRadius: 2,
						backgroundColor: "white",
						opacity: random(`o-${i}`),
					}}
				/>
			))}
		</AbsoluteFill>
	);
};
```

- CSS keyframe animations and the Web Animations API are fine: before each screenshot Motio pauses every animation on the page and sets it to the time of the frame, measured from the start of the enclosing `<Sequence>`. CSS transitions are not: they start when a style changes, which depends on the previous frame.

These rules hold in the default time model, the frame model. Code you cannot rewrite this way, such as a library that runs on its own clock, can render in the virtual time model instead (see [Code that reads the clock](#code-that-reads-the-clock)).

CSS transforms, filters and other styles can change freely from frame to frame: Motio draws every captured frame as if on a freshly loaded page, so a frame never depends on the one the tab rendered before it.

`motio check determinism` renders frames in different orders and with different numbers of tabs and compares the pixels, so a component that breaks these rules is caught in a test (see [Testing renders in CI](testing-in-ci.md)).

## Code that reads the clock

Some code animates on its own clock: GSAP timelines, Lottie in clock mode, canvas loops driven by `requestAnimationFrame`, `setInterval` counters, anything reading `Date.now()` or `performance.now()`, and `Math.random()`. In the frame model Motio does not change the page's clock, so this code runs on real time and gives different pixels on every render. There are two ways to make it deterministic.

**Drive it from the frame.** Pause the library's timeline and seek it to `frame / fps` on every render. This costs nothing extra and also follows the timeline of `motio dev`.

**Render in the virtual time model.** Motio replaces the page's clock so that `Date`, `performance.now()`, `setTimeout`, `setInterval`, `requestAnimationFrame` and `Math.random()` follow the frame: at frame 45 at 30 fps, `performance.now()` returns 1500, the timers due by then have run, and animation-frame callbacks run once per frame. Code written against the real clock then renders the same pixels on every render, unchanged. Set it on the composition:

<!-- example: examples/src/frames.tsx#virtual-clock -->
```tsx
import { Composition } from "@motiojs/motio";
import { useEffect, useRef } from "react";

// A canvas loop on requestAnimationFrame that sums the time between animation frames, as a
// third-party library would run it: it never reads the frame.
const Comet = () => {
	const canvas = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const ctx = canvas.current?.getContext("2d");
		if (!ctx) return;
		let x = 0;
		let last = performance.now();
		let id = 0;
		const loop = (now: number) => {
			x = (x + (now - last) * 0.4) % 1280;
			last = now;
			ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
			ctx.fillRect(0, 0, 1280, 720);
			ctx.fillStyle = "white";
			ctx.fillRect(x, 340, 40, 40);
			id = requestAnimationFrame(loop);
		};
		id = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(id);
	}, []);
	return <canvas ref={canvas} width={1280} height={720} />;
};

export const CometRoot = () => (
	<Composition
		id="Comet"
		component={Comet}
		width={1280}
		height={720}
		fps={30}
		durationInFrames={150}
		timeModel="virtual"
	/>
);
```

or for one render: `motio render Comet --time-model=virtual`, `timeModel: "virtual"` in the Node API (`renderMedia`, `renderStill`, `renderFrames`, `renderDistributed`), or `render.timeModel` in `motio.config.ts`. The render's choice wins over the composition's; `--time-model=frame` forces the frame model.

State that timers accumulate (a counter, a timeline that sums the time between animation frames, particles moved a little on every frame) depends on every frame before, so virtual time only moves forward: every tab steps through each frame from frame 0 before the first one it captures, and a tab is replaced instead of being sent back to an earlier frame. Frame 50 therefore shows the same state on every tab, in any order, at any concurrency, in a `--frames` range and in chunks of a distributed render. `Math.random()` is reseeded on every frame. `motio check determinism --reference=fresh` checks it as for the frame model (the composition's time model applies without a flag).

What to know before choosing it:

- Renders cost more the later a tab starts: stepping through a frame is a render without a screenshot (about 1 ms for a simple scene at 1080p, more for a heavy one), so a still at frame 900 first steps through 900 frames, and more tabs help less. On a 300-frame 1080p video of simple shapes, the virtual model took the same time as the frame model on one tab and 7 to 18% longer on 4 and 8.
- `motio dev` and the Player run the real clock: clock-driven code plays in real time there and does not follow the timeline. Check it with `motio still` or a render.
- Timers do not run while a frame waits on `delayRender()`: code that waits on a timer before calling `continueRender()` never finishes, so keep the frame model for it. A real network request still needs `delayRender()`.
- Web Workers, iframes and their timers keep the real clock, and state stored outside the page (`localStorage`, IndexedDB) carries over from one tab to the next.
- A 2D canvas that accumulates semi-transparent drawing (trails, fades) can come out slightly different under heavy machine load, because Chrome draws canvases on its GPU process; this is not about the clock and happens in the frame model too. `chromiumOptions: { flags: { "disable-accelerated-2d-canvas": true } }` in the Node API draws them in software, which removed the differences in our measurements.

## Your product's UI in a video

A video of your own app is the common case, and the first idea is to import the app's components into a composition. They render, but not the same way twice: product components animate with CSS transitions, run timers, and load data asynchronously (a query hook, a fetch in an effect), all on real time. With `motio check determinism` on this release, a CSS transition (one that follows a style set from the frame, or one a component plays when it mounts), state updated by `setInterval`, and data loaded in an effect without `delayRender()` each give frames that differ between runs. CSS `@keyframes` animations and data held with `delayRender()` give identical frames. In the virtual time model the same transitions, the `setInterval` state and data that a timer delivers give identical frames too (checked with `--reference=fresh`), but the transitions are seeked like keyframe animations, from the start of the enclosing `<Sequence>` rather than from the style change, and real network requests still arrive whenever the network delivers them.

Rebuild the screens in the video project instead, and share with the product only what has no behaviour: design tokens (colours, spacing, radii, fonts), copy, icons, and the sample records the screens show. Each rebuilt screen takes its data as plain values and gets its motion from the frame: the panel that slides in with a transition in the product slides in with `spring()` here, and the list that fills in when a query resolves shows as many rows as the frame says.

<!-- example: examples/src/frames.tsx#product-ui -->
```tsx
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "@motiojs/motio";

// Shared with the product as plain data, for example from a module both import: no components.
const tokens = { surface: "#16181d", text: "#f4f4f5", accent: "#7c5cff", radius: 12 };
const tasks = [
	{ id: 1, title: "Import the footage" },
	{ id: 2, title: "Cut the intro" },
	{ id: 3, title: "Export in 4K" },
];

// The product's task panel, rebuilt for the video. In the product it slides in with a CSS
// transition and fills its list when a query resolves; here both follow the frame.
export const TaskPanel = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const enter = spring({ frame, fps, config: { damping: 200 } });
	const shown = Math.floor(
		interpolate(frame, [15, 45], [0, tasks.length], {
			extrapolateLeft: "clamp",
			extrapolateRight: "clamp",
		}),
	);
	return (
		<AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
			<div
				style={{
					width: 420,
					padding: 24,
					borderRadius: tokens.radius,
					backgroundColor: tokens.surface,
					color: tokens.text,
					opacity: enter,
					transform: `translateY(${(1 - enter) * 40}px)`,
				}}
			>
				{tasks.slice(0, shown).map((task) => (
					<div
						key={task.id}
						style={{ padding: "8px 0", borderBottom: `1px solid ${tokens.accent}` }}
					>
						{task.title}
					</div>
				))}
			</div>
		</AbsoluteFill>
	);
};
```

The video then depends on the frame alone, and the product does not grow render flags or test hooks to fit the video.

## Frame rate and length

The frame rate and the length are set per composition (next page). `--fps` and `--duration` on the CLI override them for one render; inside a component always read them from `useVideoConfig()` instead of hard-coding 30.
