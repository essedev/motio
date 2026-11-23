import { Composition, Still } from "motio";
import "./fonts";
import { INTRO_DURATION, Intro, type IntroProps } from "./Intro";
import { Thumbnail } from "./Thumbnail";

const defaultProps: IntroProps = {
	title: "Hello, Motio",
	subtitle: "Videos made with React",
};

export const Root = () => (
	<>
		<Composition
			id="Intro"
			component={Intro}
			width={1280}
			height={720}
			fps={30}
			durationInFrames={INTRO_DURATION}
			defaultProps={defaultProps}
		/>
		<Still
			id="Thumbnail"
			component={Thumbnail}
			width={1280}
			height={720}
			defaultProps={defaultProps}
		/>
	</>
);
