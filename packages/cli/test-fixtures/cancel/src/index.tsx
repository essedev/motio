import { useEffect, useState } from "react";
import { AbsoluteFill, Composition, cancelRender, delayRender, registerRoot } from "remotion";

// cancelRender() called from a timer, outside React's render: the render must fail with
// E_CANCELLED and the frame, not as an uncaught page error.
const CancelFromTimer = () => {
	useState(() => delayRender("Fetching data"));
	useEffect(() => {
		setTimeout(() => cancelRender(new Error("bad data")), 20);
	}, []);
	return <AbsoluteFill style={{ background: "red" }} />;
};

registerRoot(() => (
	<Composition
		id="cancel"
		component={CancelFromTimer}
		width={100}
		height={100}
		fps={30}
		durationInFrames={10}
	/>
));
