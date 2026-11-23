// Browser entry of the Player media tests: a Player whose composition holds an HTML5 Video and
// an Html5Audio, exposing the elements and the Player ref on `window.__mediaTest`.
import { AbsoluteFill, useCurrentFrame } from "@motiojs/core";
import { Html5Audio, Html5Video } from "@motiojs/media";
import { createRef } from "react";
import { createRoot } from "react-dom/client";
import { Player } from "../player.js";
import type { PlayerProps, PlayerRef } from "../types.js";

const video = createRef<HTMLVideoElement>();
const audio = createRef<HTMLAudioElement>();

function Scene() {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill data-frame={frame}>
			<Html5Video ref={video} src="/stamp-30.mp4" volume={0.5} style={{ width: "100%" }} />
			<Html5Audio ref={audio} src="/clicks.wav" />
		</AbsoluteFill>
	);
}

const host = document.createElement("div");
document.body.appendChild(host);
const root = createRoot(host);
const ref = createRef<PlayerRef>();

const api = {
	mount: (props: Partial<PlayerProps> = {}) =>
		new Promise<void>((resolve) => {
			root.render(
				<Player
					ref={ref}
					component={Scene}
					durationInFrames={110}
					fps={30}
					compositionWidth={480}
					compositionHeight={270}
					{...(props as object)}
				/>,
			);
			const wait = () => {
				if (ref.current && video.current && audio.current && video.current.readyState >= 2)
					resolve();
				else requestAnimationFrame(wait);
			};
			wait();
		}),
	unmount: () => root.render(null),
	player: () => ref.current as PlayerRef,
	frame: () => ref.current?.getCurrentFrame() ?? -1,
	video: () => {
		const v = video.current as HTMLVideoElement;
		return {
			currentTime: v.currentTime,
			paused: v.paused,
			volume: v.volume,
			muted: v.muted,
			playbackRate: v.playbackRate,
			inDocument: v.isConnected,
		};
	},
	audio: () => {
		const a = audio.current as HTMLAudioElement;
		return {
			currentTime: a.currentTime,
			paused: a.paused,
			volume: a.volume,
			muted: a.muted,
			inDocument: a.isConnected,
			src: a.getAttribute("src"),
		};
	},
};

(window as unknown as { __mediaTest: typeof api }).__mediaTest = api;
document.body.dataset.ready = "true";
