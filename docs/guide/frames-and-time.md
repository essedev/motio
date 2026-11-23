# Frames and time

A video is a sequence of still images, the frames, shown at a fixed rate: 30 frames per second (fps) means frame 30 is shown at one second. In Motio a component never asks what time it is. It asks which frame it is drawing, with `useCurrentFrame()`, and returns what that frame looks like:

<!-- example: examples/src/frames.tsx#clock -->
```tsx
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

- Prefer sizes, margins and opacity to a CSS `transform` that changes on every frame. Chrome can draw an element whose transform just changed a few pixels differently from the same element drawn fresh, so the same frame may differ slightly depending on the frame the tab rendered before it. `will-change: transform` on the element avoids it when the element starts close to its final scale, not when it grows from nothing; the `basic` starter animates the size of its logo for that reason.

`motio check determinism` renders frames in different orders and with different numbers of tabs and compares the pixels, so a component that breaks these rules is caught in a test (see [Testing renders in CI](testing-in-ci.md)).

## Code that reads the clock

Some libraries animate on their own clock: GSAP, canvas loops driven by `requestAnimationFrame`, anything reading `Date.now()`. Motio does not change the page's clock, so left alone they run on real time and give different pixels on every render. Drive them from the frame instead: pause the library's timeline and seek it to `frame / fps` on every render. A mode that makes the clock follow the frame time is designed but not available in this release.

## Frame rate and length

The frame rate and the length are set per composition (next page). `--fps` and `--duration` on the CLI override them for one render; inside a component always read them from `useVideoConfig()` instead of hard-coding 30.
