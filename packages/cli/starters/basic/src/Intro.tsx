import { AbsoluteFill, Series } from "motio";
import { Logo } from "./Logo";
import { Title } from "./Title";

export interface IntroProps {
	title: string;
	subtitle: string;
}

const TITLE_FRAMES = 60;
const LOGO_FRAMES = 60;

/** Length of the whole video, in frames: the two scenes back to back. */
export const INTRO_DURATION = TITLE_FRAMES + LOGO_FRAMES;

export const Intro = ({ title, subtitle }: IntroProps) => (
	<AbsoluteFill style={{ backgroundColor: "#101820" }}>
		<Series>
			<Series.Sequence durationInFrames={TITLE_FRAMES}>
				<Title title={title} subtitle={subtitle} />
			</Series.Sequence>
			<Series.Sequence durationInFrames={LOGO_FRAMES}>
				<Logo />
			</Series.Sequence>
		</Series>
	</AbsoluteFill>
);
