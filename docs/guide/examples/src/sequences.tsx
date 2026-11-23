import { AbsoluteFill, Freeze, Loop, Sequence, Series, useCurrentFrame } from "motio";

const Scene = ({ label }: { label: string }) => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{ justifyContent: "center", alignItems: "center", fontSize: 80 }}>
			{label}: frame {frame}
		</AbsoluteFill>
	);
};

// region: sequence
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
// endregion

// region: series
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
// endregion

// region: loop-freeze
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
// endregion
