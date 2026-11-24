import { AbsoluteFill, Composition, interpolate } from "@motiojs/motio";
import {
	linearTiming,
	springTiming,
	type TransitionPresentation,
	type TransitionPresentationComponentProps,
	TransitionSeries,
	useTransitionProgress,
} from "@motiojs/transitions";
import { fade } from "@motiojs/transitions/fade";
import { iris } from "@motiojs/transitions/iris";
import { none } from "@motiojs/transitions/none";
import { slide } from "@motiojs/transitions/slide";
import { wipe } from "@motiojs/transitions/wipe";

const Scene = ({ label, color }: { label: string; color: string }) => (
	<AbsoluteFill
		style={{ backgroundColor: color, justifyContent: "center", alignItems: "center", fontSize: 96 }}
	>
		{label}
	</AbsoluteFill>
);

// region: series
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
// endregion

// region: edges
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
// endregion

// region: overlay
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
// endregion

// region: custom
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
// endregion

// region: duration
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
// endregion

// region: presentation
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
// endregion
