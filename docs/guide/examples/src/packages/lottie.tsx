import { Lottie, type LottieAnimationData } from "@motiojs/lottie";
import {
	AbsoluteFill,
	cancelRender,
	continueRender,
	delayRender,
	staticFile,
} from "@motiojs/motio";
import { useEffect, useState } from "react";

// region: fetched
// An animation JSON from public/, loaded before the first frame is captured.
export const Badge = () => {
	const [handle] = useState(() => delayRender("Loading Lottie animation"));
	const [data, setData] = useState<LottieAnimationData | null>(null);
	useEffect(() => {
		fetch(staticFile("badge.json"))
			.then((response) => response.json())
			.then((json) => {
				setData(json);
				continueRender(handle);
			})
			.catch((err) => cancelRender(err));
	}, [handle]);
	if (!data) return null;
	return (
		<AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
			<Lottie animationData={data} loop playbackRate={1.5} style={{ width: 400, height: 300 }} />
		</AbsoluteFill>
	);
};
// endregion
