import { useEffect, useState } from "react";
import {
	AbsoluteFill,
	Composition,
	cancelRender,
	delayRender,
	registerRoot,
	useCurrentFrame,
} from "remotion";

// cancelRender() called from a timer, outside React's render: the render must fail with
// E_CANCELLED and the frame, not as an uncaught page error.
const CancelFromTimer = () => {
	useState(() => delayRender("Fetching data"));
	useEffect(() => {
		setTimeout(() => cancelRender(new Error("bad data")), 20);
	}, []);
	return <AbsoluteFill style={{ background: "red" }} />;
};

// From frame 5 on, a readiness handle that never resolves: a chunked render must report
// E_READINESS_TIMEOUT with the label and the frame, as a single-node render does.
const HangFromFrame5 = () => {
	const frame = useCurrentFrame();
	useState(() => (frame >= 5 ? delayRender("fixture: data that never arrives") : null));
	return <AbsoluteFill style={{ background: "blue" }} />;
};

registerRoot(() => (
	<>
		<Composition
			id="cancel"
			component={CancelFromTimer}
			width={100}
			height={100}
			fps={30}
			durationInFrames={10}
		/>
		<Composition
			id="hang"
			component={HangFromFrame5}
			width={100}
			height={100}
			fps={30}
			durationInFrames={10}
		/>
	</>
));
