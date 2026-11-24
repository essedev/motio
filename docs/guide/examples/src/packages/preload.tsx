import { preloadAudio, preloadFont, preloadImage, preloadVideo } from "@motiojs/preload";
import { useEffect } from "react";

// region: preload
export const usePreloads = () => {
	useEffect(() => {
		const frees = [
			preloadVideo("https://example.com/intro.mp4", {
				onReady: () => console.log("intro buffered"),
			}),
			preloadAudio("/music.mp3"),
			preloadImage("/logo.png"),
			preloadFont("/fonts/inter.woff2"),
		];
		return () => {
			for (const free of frees) free();
		};
	}, []);
};
// endregion
