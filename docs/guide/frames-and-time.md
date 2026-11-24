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

CSS transforms, filters and other styles can change freely from frame to frame: Motio draws every captured frame as if on a freshly loaded page, so a frame never depends on the one the tab rendered before it.

`motio check determinism` renders frames in different orders and with different numbers of tabs and compares the pixels, so a component that breaks these rules is caught in a test (see [Testing renders in CI](testing-in-ci.md)).

## Code that reads the clock

Some libraries animate on their own clock: GSAP, canvas loops driven by `requestAnimationFrame`, anything reading `Date.now()`. Motio does not change the page's clock, so left alone they run on real time and give different pixels on every render. Drive them from the frame instead: pause the library's timeline and seek it to `frame / fps` on every render. A mode that makes the clock follow the frame time is designed but not available in this release.

## Your product's UI in a video

A video of your own app is the common case, and the first idea is to import the app's components into a composition. They render, but not the same way twice: product components animate with CSS transitions, run timers, and load data asynchronously (a query hook, a fetch in an effect), all on real time. With `motio check determinism` on this release, a CSS transition (one that follows a style set from the frame, or one a component plays when it mounts), state updated by `setInterval`, and data loaded in an effect without `delayRender()` each give frames that differ between runs. CSS `@keyframes` animations and data held with `delayRender()` give identical frames.

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
