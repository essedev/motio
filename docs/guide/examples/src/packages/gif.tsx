import { Gif, getGifDurationInSeconds, preloadGif } from "@motiojs/gif";
import {
	AbsoluteFill,
	type CalculateMetadataFunction,
	Composition,
	staticFile,
} from "@motiojs/motio";
import { useEffect } from "react";

// region: gif
export const Reaction = () => (
	<AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
		{/* public/reaction.gif, fitted into 480x480; it starts one second in (at 30 fps), plays
		    at half speed and stays on its last frame. */}
		<Gif
			src={staticFile("reaction.gif")}
			width={480}
			height={480}
			fit="contain"
			from={30}
			playbackRate={0.5}
			loopBehavior="pause-after-finish"
		/>
	</AbsoluteFill>
);
// endregion

// region: duration
const FPS = 30;

// A video exactly as long as one play of the GIF.
const calculateMetadata: CalculateMetadataFunction<{ src: string }> = async ({ props }) => ({
	durationInFrames: Math.ceil((await getGifDurationInSeconds(staticFile(props.src))) * FPS),
});

const Sticker = ({ src }: { src: string }) => (
	<Gif src={staticFile(src)} width={512} height={512} fit="cover" />
);

export const StickerRoot = () => (
	<Composition
		id="Sticker"
		component={Sticker}
		width={512}
		height={512}
		fps={FPS}
		durationInFrames={FPS}
		defaultProps={{ src: "sticker.gif" }}
		calculateMetadata={calculateMetadata}
	/>
);
// endregion

// region: preload
// In an app that embeds the Player: decode the GIF before the scene that shows it mounts.
export const usePreloadedGif = (src: string) => {
	useEffect(() => {
		const { waitUntilDone, free } = preloadGif(src);
		waitUntilDone().catch((error: unknown) => console.warn(`Could not preload ${src}`, error));
		return free;
	}, [src]);
};
// endregion
