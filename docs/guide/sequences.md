# Sequences and series

`<Sequence>` places its children on the timeline. Inside it, `useCurrentFrame()` counts from the start of the sequence, so a component can be written as if it started at frame 0 and then moved anywhere in the video:

<!-- example: examples/src/sequences.tsx#sequence -->
```tsx
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

Every `Series.Sequence` needs a `durationInFrames`; only the last one may be `Infinity`. For transitions between scenes (fades, slides, wipes), `@motiojs/transitions` provides `<TransitionSeries>` with ready-made presentations.

## Loop and Freeze

<!-- example: examples/src/sequences.tsx#loop-freeze -->
```tsx
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

`<Loop>` repeats a range of its children (`times` limits the repetitions; by default it loops until the parent ends). `<Freeze>` holds its children at one frame; its `active` prop can be a function of the frame, to freeze only part of the time.
