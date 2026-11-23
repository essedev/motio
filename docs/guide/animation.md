# Animation

Animation in Motio is a function from the frame number to a value. Three helpers cover almost everything: `interpolate()` maps ranges, `spring()` adds physics, and `Easing` shapes the curve.

## interpolate()

`interpolate(input, inputRange, outputRange, options)` maps a value from one range to another. With the frame as input, a list of frames becomes a list of positions, sizes or opacities:

<!-- example: examples/src/animation.tsx#interpolate -->
```tsx
export const LowerThird = ({ name }: { name: string }) => {
	const frame = useCurrentFrame();
	const { durationInFrames } = useVideoConfig();
	// Slides in during frames 10-25, stays, slides out during the last 15 frames.
	const left = interpolate(
		frame,
		[10, 25, durationInFrames - 15, durationInFrames],
		[-600, 60, 60, -600],
		{ easing: Easing.out(Easing.quad), extrapolateLeft: "clamp", extrapolateRight: "clamp" },
	);
	// Without clamping, the bar would keep growing after frame 40.
	const barWidth = interpolate(frame, [18, 40], [0, 420], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	return (
		<AbsoluteFill>
			<div style={{ position: "absolute", left, bottom: 120, fontSize: 56, color: "white" }}>
				{name}
				<div style={{ width: barWidth, height: 6, backgroundColor: "#ffb000" }} />
			</div>
		</AbsoluteFill>
	);
};
```

- The input range must be increasing, with as many entries as the output range; more than two entries give several segments.
- Outside the input range the value keeps going along the first or last segment (`"extend"`, the default). `"clamp"` holds the end value, `"identity"` returns the input, `"wrap"` repeats the range. Set `extrapolateLeft` and `extrapolateRight` separately.
- `easing` applies a curve to each segment.

## spring()

`spring()` animates from 0 to 1 the way a physical spring would, with a natural overshoot and settle that easing curves do not reproduce:

<!-- example: examples/src/animation.tsx#spring -->
```tsx
export const Badge = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	// From 0 to 1 with a physical spring, starting at frame 10; it overshoots, then settles.
	const grow = spring({ frame, fps, delay: 10, config: { damping: 12, stiffness: 120 } });
	// A spring stretched to exactly 30 frames, without bounce.
	const rise = spring({ frame, fps, durationInFrames: 30, config: { damping: 200 } });
	return (
		<AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
			<div
				style={{
					width: 240 * grow,
					height: 240 * grow,
					borderRadius: "50%",
					backgroundColor: "#ffb000",
					marginTop: interpolate(rise, [0, 1], [200, 0]),
				}}
			/>
		</AbsoluteFill>
	);
};

// How many frames the spring takes to settle, for example to size a Sequence.
export const badgeFrames = measureSpring({ fps: 30, config: { damping: 12, stiffness: 120 } });
```

| Option | Meaning |
|---|---|
| `frame`, `fps` | Required: the current frame and the frame rate. |
| `config` | `mass` (default 1), `stiffness` (100), `damping` (10), `overshootClamping` (false). Higher damping bounces less; 200 does not bounce. |
| `from`, `to` | The values to animate between (default 0 and 1). |
| `delay` | Frames to wait before starting. |
| `durationInFrames` | Stretches the spring so it settles in exactly this many frames. |
| `reverse` | Plays it backwards. |

A spring's output is a progress value: feed it to `interpolate()` to move between any two values, as `rise` does above, or multiply it, as `grow` does. `measureSpring()` returns how many frames a spring takes to settle.

## Colours

`interpolateColors()` interpolates between CSS colours (hex, `rgb()`, `hsl()`, named colours), in RGB space with alpha:

<!-- example: examples/src/animation.tsx#colors -->
```tsx
export const Sunset = () => {
	const frame = useCurrentFrame();
	const backgroundColor = interpolateColors(frame, [0, 60, 120], ["#87ceeb", "#ff8c42", "#2b1055"]);
	return <AbsoluteFill style={{ backgroundColor }} />;
};
```

## Easing

`Easing` provides the standard curves, to pass to `interpolate()`'s `easing` option:

<!-- example: examples/src/animation.tsx#easing -->
```tsx
// Built-in curves, composable: Easing.in, Easing.out and Easing.inOut wrap any of them.
export const curves = [
	Easing.linear,
	Easing.out(Easing.quad),
	Easing.inOut(Easing.exp),
	Easing.bezier(0.33, 1, 0.68, 1),
	Easing.elastic(1),
];
```

`Easing.in(curve)` accelerates, `Easing.out(curve)` decelerates and `Easing.inOut(curve)` does both; the curves are `linear`, `ease`, `quad`, `cubic`, `poly(n)`, `sin`, `circle`, `exp`, `elastic(bounciness)`, `back(overshoot)`, `bounce`, and `bezier(x1, y1, x2, y2)` for a CSS-style cubic Bézier.
