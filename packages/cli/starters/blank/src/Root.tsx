import { Composition } from "@motiojs/motio";
import { Main } from "./Main";

export const Root = () => (
	<Composition
		id="Main"
		component={Main}
		width={1280}
		height={720}
		fps={30}
		durationInFrames={90}
		defaultProps={{ text: "Hello, Motio" }}
	/>
);
