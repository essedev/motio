# @motiojs/transitions

Transitions between scenes for [Motio](../../README.md) videos: `<TransitionSeries>` plays scenes one after the other like `<Series>`, and a transition between two of them overlaps the end of one with the start of the next while a presentation (a fade, a slide, a wipe, ...) mixes them.

```bash
pnpm add @motiojs/transitions
```

## TransitionSeries

<!-- example: ../../docs/guide/examples/src/packages/transitions.tsx#series -->
```tsx
import { linearTiming, springTiming, TransitionSeries } from "@motiojs/transitions";
import { fade } from "@motiojs/transitions/fade";
import { slide } from "@motiojs/transitions/slide";

export const Slides = () => (
	<TransitionSeries>
		<TransitionSeries.Sequence durationInFrames={60}>
			<Scene label="One" color="#101820" />
		</TransitionSeries.Sequence>
		{/* For 15 frames "Two" fades in over "One". */}
		<TransitionSeries.Transition
			presentation={fade()}
			timing={linearTiming({ durationInFrames: 15 })}
		/>
		<TransitionSeries.Sequence durationInFrames={60}>
			<Scene label="Two" color="#3a1f5d" />
		</TransitionSeries.Sequence>
		{/* "Three" pushes "Two" out to the left; the spring sets the length (23 frames at 30 fps). */}
		<TransitionSeries.Transition
			presentation={slide({ direction: "from-right" })}
			timing={springTiming({ config: { damping: 200 } })}
		/>
		<TransitionSeries.Sequence durationInFrames={60}>
			<Scene label="Three" color="#ffb000" />
		</TransitionSeries.Sequence>
	</TransitionSeries>
);
```

A `<TransitionSeries>` accepts three kinds of children, in any order that alternates scenes with what goes between them:

| Child | Props | |
|---|---|---|
| `<TransitionSeries.Sequence>` | `durationInFrames` (required), `offset`, `name`, `style`, `className`, `premountFor`, ... | A scene. Inside it, `useCurrentFrame()` starts at 0 when the scene starts, as in `<Series.Sequence>`. |
| `<TransitionSeries.Transition>` | `timing` (required), `presentation` (default `slide()`) | An effect between the scenes on either side. |
| `<TransitionSeries.Overlay>` | `durationInFrames` (required), `offset` | Something drawn over the cut, without moving the scenes. |

How the scenes are placed:

- Without transitions, each scene starts when the previous one ends, as in `<Series>`. An `offset` shifts a scene and everything after it.
- A transition of N frames between two scenes makes the second one start N frames earlier: both are on screen during those N frames, and the series gets N frames shorter.
- A transition before the first scene or after the last one animates that scene's entrance or exit over what is behind the series, without moving anything.
- A transition cannot be longer than the scene before or after it, two transitions or a transition and an overlay cannot be next to each other, and only the last scene may last `Infinity`. Each of these throws an error that names the child.

The series takes the props of a `<Sequence>` for itself (`from`, `durationInFrames`, `name`, `style`, ...): `from={30}` starts the whole series one second in at 30 fps.

## How long a series is

The composition's `durationInFrames` is not taken from the series: frames after the last scene are empty. Compute it from the same data as the scenes:

<!-- example: ../../docs/guide/examples/src/packages/transitions.tsx#duration -->
```tsx
import { Composition } from "@motiojs/motio";
import { springTiming, TransitionSeries } from "@motiojs/transitions";
import { fade } from "@motiojs/transitions/fade";

const FPS = 30;
const scenes = [
	{ label: "Intro", color: "#101820", frames: 90 },
	{ label: "Feature", color: "#3a1f5d", frames: 120 },
	{ label: "Outro", color: "#ffb000", frames: 90 },
];
const timing = springTiming({ config: { damping: 200 } });

// Each transition between two scenes overlaps them, so it shortens the series by its own
// length: 300 frames of scenes minus 2 transitions of 23 frames is 254 frames.
const SERIES_DURATION =
	scenes.reduce((total, scene) => total + scene.frames, 0) -
	(scenes.length - 1) * timing.getDurationInFrames({ fps: FPS });

const Story = () => (
	<TransitionSeries>
		{scenes.flatMap((scene, index) => [
			index > 0 ? (
				<TransitionSeries.Transition
					key={`${scene.label}-in`}
					presentation={fade()}
					timing={timing}
				/>
			) : null,
			<TransitionSeries.Sequence key={scene.label} durationInFrames={scene.frames}>
				<Scene label={scene.label} color={scene.color} />
			</TransitionSeries.Sequence>,
		])}
	</TransitionSeries>
);

export const StoryRoot = () => (
	<Composition
		id="Story"
		component={Story}
		width={1920}
		height={1080}
		fps={FPS}
		durationInFrames={SERIES_DURATION}
	/>
);
```

The rule: the sum of the scenes' durations, minus the length of every transition that sits between two scenes. Transitions before the first scene or after the last one, and overlays, do not change it; `offset`s add their value. `timing.getDurationInFrames({ fps })` gives the length of a transition, which for a spring depends on the frame rate.

## Timings

A timing says how long a transition lasts and how its progress goes from 0 to 1.

| Timing | Options | Length |
|---|---|---|
| `linearTiming({ durationInFrames, easing? })` | `easing`: any `Easing` function of `@motiojs/motio`. | `durationInFrames`. |
| `springTiming({ config?, durationInFrames?, durationRestThreshold?, reverse? })` | The spring options of `spring()`. | The frames the spring takes to settle (23 for `damping: 200` at 30 fps), or `durationInFrames` to stretch it to a fixed length. |

A timing is an object with `getDurationInFrames({ fps })` and `getProgress({ frame, fps })`; any object of that shape works, as long as both functions are deterministic.

## Presentations

Each presentation is a function imported from its own path, which returns what `presentation` takes:

| Import | Effect | Options |
|---|---|---|
| `fade()` from `@motiojs/transitions/fade` | The entering scene fades in over the exiting one. | `shouldFadeOutExitingScene` (default false: fading both opaque scenes would show the background halfway), `enterStyle`, `exitStyle`. |
| `slide()` from `@motiojs/transitions/slide` | The entering scene slides in and pushes the other out. | `direction`: `"from-left"` (default), `"from-right"`, `"from-top"`, `"from-bottom"`. |
| `wipe()` from `@motiojs/transitions/wipe` | The entering scene is revealed from a side or a corner. | `direction`: the four sides and four corners (`"from-top-left"`, ...), default `"from-left"`. |
| `flip()` from `@motiojs/transitions/flip` | The exiting scene turns over and shows the entering one on its back. | `direction`, `perspective` (default 1000 px). |
| `cube()` from `@motiojs/transitions/cube` | Both scenes are faces of a turning cube. | `direction` (required), `perspective`. |
| `clockWipe()` from `@motiojs/transitions/clock-wipe` | A clock hand sweeps the exiting scene away from 12 o'clock. | `width`, `height`: the size of the video (required). |
| `iris()` from `@motiojs/transitions/iris` | The entering scene appears through a growing circle. | `width`, `height` (required). |
| `pushCut()` from `@motiojs/transitions/push-cut` | A hard cut with a slight push-in and a short flash. | `cutProgress`, scales, `flashColor`, `flashOpacity`, `flashFrames`. |
| `none()` from `@motiojs/transitions/none` | Both scenes as they are, for effects you drive yourself (below). | |

All of them except `cube()` also take style props for the elements they wrap the scenes in, applied while a scene enters or exits.

<!-- example: ../../docs/guide/examples/src/packages/transitions.tsx#edges -->
```tsx
import { linearTiming, TransitionSeries } from "@motiojs/transitions";
import { iris } from "@motiojs/transitions/iris";
import { wipe } from "@motiojs/transitions/wipe";

export const Opening = () => (
	<TransitionSeries>
		{/* A transition before the first scene animates its entrance over the background. */}
		<TransitionSeries.Transition
			presentation={wipe({ direction: "from-top-left" })}
			timing={linearTiming({ durationInFrames: 20 })}
		/>
		<TransitionSeries.Sequence durationInFrames={90}>
			<Scene label="Title" color="#101820" />
		</TransitionSeries.Sequence>
		{/* iris() and clockWipe() draw a shape and need the size of the video. */}
		<TransitionSeries.Transition
			presentation={iris({ width: 1920, height: 1080 })}
			timing={linearTiming({ durationInFrames: 20 })}
		/>
	</TransitionSeries>
);
```

### Canvas presentations

`blurSlide`, `bookFlip`, `crosswarp`, `crossZoom`, `dissolve`, `dreamyZoom`, `filmBurn`, `linearBlur`, `ripple`, `swap`, `zoomBlur` and `zoomInOut` (each from `@motiojs/transitions/<kebab-case name>`, for example `@motiojs/transitions/film-burn`) are drawn by a WebGL shader from images of both scenes, which Chrome's HTML-in-canvas API takes. Motio's renderer runs a Chrome that has it; the preview and the Player run in your own browser, where Chrome 157 or later has it. In a browser without it (Safari, Firefox) the transition is shown as a cut and a warning is logged once. `makeHtmlInCanvasPresentation()` builds one from your own shader. The `effects` option of these presentations is not supported and throws.

## Overlays

<!-- example: ../../docs/guide/examples/src/packages/transitions.tsx#overlay -->
```tsx
import { AbsoluteFill } from "@motiojs/motio";
import { TransitionSeries } from "@motiojs/transitions";

export const WithFlash = () => (
	<TransitionSeries>
		<TransitionSeries.Sequence durationInFrames={60}>
			<Scene label="Before" color="#101820" />
		</TransitionSeries.Sequence>
		{/* Centred on the cut: frames 55 to 64. The scenes do not overlap and nothing moves. */}
		<TransitionSeries.Overlay durationInFrames={10}>
			<AbsoluteFill style={{ backgroundColor: "white" }} />
		</TransitionSeries.Overlay>
		<TransitionSeries.Sequence durationInFrames={60}>
			<Scene label="After" color="#3a1f5d" />
		</TransitionSeries.Sequence>
	</TransitionSeries>
);
```

An overlay is centred on the cut between its neighbours (half of it before, half after) and shifted by `offset`. It must stay within the two scenes next to it.

## Custom effects

With `none()`, each scene reads the progress of its transitions with `useTransitionProgress()`: `entering` goes from 0 to 1 while the scene comes in (1 when it does not), `exiting` from 0 to 1 while it goes out (0 when it does not).

<!-- example: ../../docs/guide/examples/src/packages/transitions.tsx#custom -->
```tsx
import { AbsoluteFill, interpolate } from "@motiojs/motio";
import { linearTiming, TransitionSeries, useTransitionProgress } from "@motiojs/transitions";
import { none } from "@motiojs/transitions/none";

// With none(), both scenes are shown as they are and each one reads the progress itself.
const ZoomingScene = ({ label }: { label: string }) => {
	const { entering, exiting } = useTransitionProgress();
	const scale = interpolate(entering, [0, 1], [1.4, 1]) * interpolate(exiting, [0, 1], [1, 0.6]);
	return (
		<AbsoluteFill
			style={{
				justifyContent: "center",
				alignItems: "center",
				fontSize: 96,
				color: "white",
				opacity: entering * (1 - exiting),
				transform: `scale(${scale})`,
			}}
		>
			{label}
		</AbsoluteFill>
	);
};

export const Zooms = () => (
	<AbsoluteFill style={{ backgroundColor: "#101820" }}>
		<TransitionSeries>
			<TransitionSeries.Sequence durationInFrames={60}>
				<ZoomingScene label="Near" />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition
				presentation={none()}
				timing={linearTiming({ durationInFrames: 20 })}
			/>
			<TransitionSeries.Sequence durationInFrames={60}>
				<ZoomingScene label="Far" />
			</TransitionSeries.Sequence>
		</TransitionSeries>
	</AbsoluteFill>
);
```

To reuse an effect, write it as a presentation: a component that receives each scene with its direction and the progress, and the props you give it.

<!-- example: ../../docs/guide/examples/src/packages/transitions.tsx#presentation -->
```tsx
import { AbsoluteFill } from "@motiojs/motio";
import type {
	TransitionPresentation,
	TransitionPresentationComponentProps,
} from "@motiojs/transitions";

type FocusProps = { maxBlur: number };

// Called twice during a transition, once for each scene, with the same progress.
const Focus = ({
	children,
	presentationDirection,
	presentationProgress,
	passedProps,
}: TransitionPresentationComponentProps<FocusProps>) => {
	// The exiting scene goes out of focus while the entering one comes into focus over it.
	const blur =
		presentationDirection === "exiting" ? presentationProgress : 1 - presentationProgress;
	return (
		<AbsoluteFill
			style={{
				filter: `blur(${blur * passedProps.maxBlur}px)`,
				opacity: presentationDirection === "entering" ? presentationProgress : 1,
			}}
		>
			{children}
		</AbsoluteFill>
	);
};

export const focus = (props: FocusProps): TransitionPresentation<FocusProps> => ({
	component: Focus,
	props,
});

// <TransitionSeries.Transition presentation={focus({ maxBlur: 24 })} timing={...} />
```

## Compatibility

The compat alias maps `@remotion/transitions` and its subpaths here. The `motionBlur` prop of `<TransitionSeries.Transition>` is accepted and has no effect yet, and `layout="none"` is accepted with a warning: scenes must stay absolutely positioned.
