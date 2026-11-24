import { AbsoluteFill, Audio, OffthreadVideo, Sequence } from "@motiojs/motio";
import { Player } from "@motiojs/player";
import { preloadAudio, preloadVideo } from "@motiojs/preload";
import { useEffect, useState } from "react";

// region: preload
const TRAILER = "https://cdn.example.com/trailer.mp4";
const MUSIC = "https://cdn.example.com/music.mp3";

// The trailer starts 5 seconds in (at 30 fps). Without preloading, the browser starts fetching
// it only when the sequence mounts, and the player stands still until enough has arrived.
const Promo = () => (
	<AbsoluteFill style={{ backgroundColor: "black" }}>
		<Audio src={MUSIC} />
		<Sequence from={150}>
			<OffthreadVideo src={TRAILER} />
		</Sequence>
	</AbsoluteFill>
);

// The page of your app that embeds the player.
export const PromoPage = () => {
	const [trailerReady, setTrailerReady] = useState(false);
	useEffect(() => {
		// Both downloads start when the page mounts. Each call returns a function that frees it.
		const frees = [
			preloadVideo(TRAILER, { onReady: () => setTrailerReady(true) }),
			preloadAudio(MUSIC),
		];
		return () => {
			for (const free of frees) free();
		};
	}, []);
	return (
		<>
			<Player
				component={Promo}
				durationInFrames={450}
				fps={30}
				compositionWidth={1920}
				compositionHeight={1080}
				controls
				style={{ width: "100%" }}
			/>
			{trailerReady ? null : <p>Loading the trailer...</p>}
		</>
	);
};
// endregion
