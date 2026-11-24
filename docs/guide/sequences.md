# Sequences and series

`<Sequence>` places its children on the timeline. Inside it, `useCurrentFrame()` counts from the start of the sequence, so a component can be written as if it started at frame 0 and then moved anywhere in the video:

<!-- example: examples/src/sequences.tsx#sequence -->
```tsx
import { AbsoluteFill, Sequence } from "@motiojs/motio";

export const Timeline = () => (
	<AbsoluteFill>
		{/* Frames 0-59 of the video. */}
		<Sequence durationInFrames={60}>
			<Scene label="Intro" />
		</Sequence>
		{/* Starts at frame 45 and lasts until the end; its children see frame 0 at frame 45. */}
		<Sequence from={45} name="Main">
			<Scene label="Main" />
		</Sequence>
	</AbsoluteFill>
);
```

| Prop | Meaning |
|---|---|
| `from` | Frame of the parent at which the children see frame 0. Default 0; may be negative. |
| `durationInFrames` | How long the children are shown. Default: until the end. Outside the range nothing is rendered. |
| `trimBefore` | Skips the first frames of the children. |
| `playbackRate` | Speed of the children's timeline: 2 plays them twice as fast. |
| `name` | Label in the preview. |
| `layout` | `"absolute-fill"` (default) wraps the children in a full-size absolutely positioned box, so sequences stack like layers; `"none"` renders them in place. |
| `style`, `className` | Applied to that box. |
| `width`, `height` | Size of the box; `useVideoConfig()` in the children reports it. |

Inside a sequence, `useVideoConfig().durationInFrames` is the length of the sequence, which makes "fade out over the last 10 frames" independent of where the scene sits. Sequences nest: each level counts from its own start.

## Series

`<Series>` plays its `<Series.Sequence>` children one after the other, each starting when the previous one ends. An `offset` shifts a sequence and everything after it; a negative offset overlaps the previous one:

<!-- example: examples/src/sequences.tsx#series -->
```tsx
import { Series } from "@motiojs/motio";

const chapters = [
	{ title: "The problem", frames: 120 },
	{ title: "The idea", frames: 150 },
	{ title: "How it works", frames: 240 },
];

export const Explainer = () => (
	<Series>
		{chapters.map((chapter, index) => (
			// From the second chapter on, each one starts 20 frames before the previous one ends,
			// so the two overlap and can fade into each other.
			<Series.Sequence
				key={chapter.title}
				durationInFrames={chapter.frames}
				offset={index === 0 ? 0 : -20}
				name={chapter.title}
			>
				<Scene label={chapter.title} />
			</Series.Sequence>
		))}
	</Series>
);
```

Every `Series.Sequence` needs a `durationInFrames`; only the last one may be `Infinity`.

## Transitions

`<TransitionSeries>` from [`@motiojs/transitions`](../../packages/transitions/README.md) is a series with effects between its scenes. A `<TransitionSeries.Transition>` between two scenes overlaps them for its length, and its presentation (a fade, a slide, a wipe, ...) mixes them; its timing sets the length and the pace:

<!-- example: examples/src/packages/transitions.tsx#series -->
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

The package README lists the presentations and timings, overlays and custom effects.

### How long a transition series is

Each transition between two scenes shortens the series by its own length, and the composition's `durationInFrames` is not adjusted for you: a composition longer than the series ends on empty frames. Compute the length from the same data as the scenes:

<!-- example: examples/src/packages/transitions.tsx#duration -->
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

A transition before the first scene or after the last one, and an overlay, do not change the length.

## Loop and Freeze

<!-- example: examples/src/sequences.tsx#loop-freeze -->
```tsx
import { AbsoluteFill, Freeze, Loop } from "@motiojs/motio";

export const Repeats = () => (
	<AbsoluteFill>
		{/* Plays frames 0-29 of the child three times. */}
		<Loop durationInFrames={30} times={3}>
			<Scene label="Loop" />
		</Loop>
		{/* Always shows frame 10 of the child. */}
		<Freeze frame={10}>
			<Scene label="Frozen" />
		</Freeze>
	</AbsoluteFill>
);
```

`<Loop>` repeats a range of its children (`times` limits the repetitions; by default it loops until the parent ends). `<Freeze>` holds its children at one frame; its `active` prop can be a function of the frame, to freeze only part of the time. The frame is held inside the composition: in a `<Still>`, or past the end of a shorter composition, a `<Freeze frame={90}>` shows the last frame of the composition instead, and Motio warns. To show frame 90 of a scene there, shift it with a sequence: `<Freeze frame={0}><Sequence from={-90}><Scene /></Sequence></Freeze>`.
