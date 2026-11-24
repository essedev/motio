import { springTiming, TransitionSeries } from "@motiojs/transitions";
import { slide } from "@motiojs/transitions/slide";
import { useLayout } from "../brand/layout";
import { CALM_SPRING } from "../brand/tokens";
import { CodeScene } from "./CodeScene";
import { EndCard } from "./EndCard";
import { Install } from "./Install";
import { Intro } from "./Intro";
import { Pitch } from "./Pitch";
import { Reasons } from "./Reasons";
import { Speed } from "./Speed";

/** The scenes in order, with how long each one plays (transitions overlap them). */
const SCENES = [
	{ id: "intro", Scene: Intro, frames: 60 },
	{ id: "pitch", Scene: Pitch, frames: 75 },
	{ id: "code", Scene: CodeScene, frames: 150 },
	{ id: "reasons", Scene: Reasons, frames: 135 },
	{ id: "speed", Scene: Speed, frames: 105 },
	{ id: "install", Scene: Install, frames: 75 },
	{ id: "end", Scene: EndCard, frames: 90 },
] as const;

/** Each cut is a flat field pushing the previous one out, with the calm spring. */
const TRANSITION_FRAMES = 16;
const timing = springTiming({ config: CALM_SPRING, durationInFrames: TRANSITION_FRAMES });

export const TEASER_FRAMES =
	SCENES.reduce((sum, s) => sum + s.frames, 0) - (SCENES.length - 1) * TRANSITION_FRAMES;

/** The teaser, wide or tall: the same scenes, each recomposed for the frame's shape. */
export const Teaser = () => {
	const { tall } = useLayout();
	const presentation = slide({ direction: tall ? "from-bottom" : "from-right" });
	return (
		<TransitionSeries>
			{SCENES.flatMap(({ id, Scene, frames }, i) => [
				...(i > 0
					? [
							<TransitionSeries.Transition
								key={`${id}-in`}
								presentation={presentation}
								timing={timing}
							/>,
						]
					: []),
				<TransitionSeries.Sequence key={id} durationInFrames={frames} name={id}>
					<Scene />
				</TransitionSeries.Sequence>,
			])}
		</TransitionSeries>
	);
};
