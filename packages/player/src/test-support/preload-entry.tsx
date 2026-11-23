// Browser entry of the Player preload tests: a Player whose composition mounts an HTML5 video or
// audio half a second in (inside a Sequence), and the preload functions, on `window.__preloadTest`.
// While playing, a frame loop records when the Player's frame changes, so the tests can find
// stalls.
import { AbsoluteFill, Sequence } from "@motiojs/core";
import { Html5Audio, Html5Video } from "@motiojs/media";
import { preloadAudio, preloadVideo } from "@motiojs/preload";
import { createRef } from "react";
import { createRoot } from "react-dom/client";
import { Player } from "../player.js";
import type { PlayerRef } from "../types.js";

const host = document.createElement("div");
document.body.appendChild(host);
const root = createRoot(host);
const ref = createRef<PlayerRef>();
const START = 15;

interface SceneProps {
	kind: "video" | "audio";
	src: string;
}

function Scene({ kind, src }: SceneProps) {
	return (
		<AbsoluteFill style={{ background: "black" }}>
			<Sequence from={START}>
				{kind === "video" ? (
					<Html5Video src={src} pauseWhenBuffering muted style={{ width: "100%" }} />
				) : (
					<Html5Audio src={src} pauseWhenBuffering />
				)}
			</Sequence>
		</AbsoluteFill>
	);
}

const api = {
	/** Resolves once the preload reports ready. */
	preload: (kind: "video" | "audio", src: string) =>
		new Promise<void>((resolve, reject) => {
			(kind === "video" ? preloadVideo : preloadAudio)(src, { onReady: resolve, onError: reject });
		}),
	mount: (kind: "video" | "audio", src: string) =>
		new Promise<void>((resolve) => {
			root.render(
				<Player
					ref={ref}
					component={Scene}
					inputProps={{ kind, src }}
					durationInFrames={120}
					fps={30}
					compositionWidth={320}
					compositionHeight={180}
					numberOfSharedAudioTags={2}
				/>,
			);
			const wait = () => (ref.current ? resolve() : requestAnimationFrame(wait));
			wait();
		}),
	/**
	 * Plays until `untilFrame` (or `timeoutMs`), sampling the frame on every animation frame.
	 * Returns the longest time the frame stood still after the media mounted, and the Player's
	 * waiting events.
	 */
	play: (untilFrame: number, timeoutMs: number) =>
		new Promise<{ longestStillMs: number; waiting: number; elapsedMs: number; frame: number }>(
			(resolve) => {
				const player = ref.current as PlayerRef;
				let waiting = 0;
				const onWaiting = () => waiting++;
				player.addEventListener("waiting", onWaiting);
				const start = performance.now();
				let lastFrame = -1;
				let lastChange = start;
				let longestStillMs = 0;
				player.play();
				const tick = () => {
					const now = performance.now();
					const frame = player.getCurrentFrame();
					if (frame !== lastFrame) {
						if (lastFrame >= START) longestStillMs = Math.max(longestStillMs, now - lastChange);
						lastFrame = frame;
						lastChange = now;
					}
					if (frame >= untilFrame || now - start > timeoutMs) {
						if (lastFrame >= START) longestStillMs = Math.max(longestStillMs, now - lastChange);
						player.pause();
						player.removeEventListener("waiting", onWaiting);
						resolve({ longestStillMs, waiting, elapsedMs: now - start, frame });
						return;
					}
					requestAnimationFrame(tick);
				};
				requestAnimationFrame(tick);
			},
		),
	unmount: () => root.render(null),
};

(window as unknown as { __preloadTest: typeof api }).__preloadTest = api;
document.body.dataset.ready = "true";
