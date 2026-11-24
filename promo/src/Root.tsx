import { Composition, Folder, Sequence, Still } from "motio";
import "./brand/fonts";
import { REST_FRAME } from "./brand/motion";
import { MARK_LOOP_FRAMES, MarkLoop } from "./stills/MarkLoop";
import { OgCard } from "./stills/OgCard";
import { ReadmeBanner } from "./stills/ReadmeBanner";
import { SquarePost } from "./stills/SquarePost";
import { TEASER_FRAMES, Teaser } from "./teaser/Teaser";

/**
 * A still is the resting frame of a scene that plays in the teaser. A sequence that starts
 * REST_FRAME frames before the still shows the scene at that frame, with a timeline long enough
 * for the sequences inside it. (`<Freeze>` would keep the still's one-frame length, and every
 * sequence below it that starts after frame 0 would be hidden.)
 */
const resting = (Scene: React.ComponentType) => () => (
	<Sequence from={-REST_FRAME}>
		<Scene />
	</Sequence>
);

const OgCardStill = resting(OgCard);
const ReadmeBannerStill = resting(ReadmeBanner);
const SquarePostStill = resting(SquarePost);

export const Root = () => (
	<>
		<Folder name="Stills">
			<Still id="og-card" component={OgCardStill} width={1200} height={630} />
			<Still id="readme-banner" component={ReadmeBannerStill} width={1280} height={320} />
			<Still id="square-post" component={SquarePostStill} width={1080} height={1080} />
		</Folder>
		<Folder name="Teasers">
			<Composition
				id="teaser"
				component={Teaser}
				width={1920}
				height={1080}
				fps={30}
				durationInFrames={TEASER_FRAMES}
			/>
			<Composition
				id="teaser-vertical"
				component={Teaser}
				width={1080}
				height={1920}
				fps={30}
				durationInFrames={TEASER_FRAMES}
			/>
		</Folder>
		<Folder name="Animated">
			<Composition
				id="mark-loop"
				component={MarkLoop}
				width={240}
				height={240}
				fps={30}
				durationInFrames={MARK_LOOP_FRAMES}
			/>
			<Composition
				id="og-card-animated"
				component={OgCard}
				width={1200}
				height={630}
				fps={30}
				durationInFrames={REST_FRAME}
			/>
		</Folder>
	</>
);
