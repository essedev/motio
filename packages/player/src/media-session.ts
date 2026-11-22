import { useEffect } from "react";
import type { PlaybackStore } from "./playback-store.js";
import type { BrowserMediaControlsBehavior } from "./types.js";

const ACTIONS: MediaSessionAction[] = [
	"play",
	"pause",
	"previoustrack",
	"nexttrack",
	"seekbackward",
	"seekforward",
	"seekto",
];

/** Seconds the media keys seek by in `register-media-session` mode. */
const SEEK_SECONDS = 10;

function session(): MediaSession | null {
	return typeof navigator !== "undefined" && "mediaSession" in navigator
		? navigator.mediaSession
		: null;
}

function setHandler(
	s: MediaSession,
	action: MediaSessionAction,
	handler: MediaSessionActionHandler | null,
) {
	try {
		s.setActionHandler(action, handler);
	} catch {
		// Browsers throw a TypeError for actions they do not implement; those keys stay unhandled.
	}
}

/**
 * Applies `browserMediaControlsBehavior`: `prevent-media-session` maps media keys to no-ops,
 * `register-media-session` lets them drive the Player and reports its position, `do-nothing`
 * leaves the browser's defaults.
 */
export function useMediaSession(
	store: PlaybackStore,
	behavior: BrowserMediaControlsBehavior,
	fps: number,
	durationInFrames: number,
	playbackRate: number,
): void {
	const { mode } = behavior;
	useEffect(() => {
		const s = session();
		if (!s || mode === "do-nothing") return;
		if (mode === "prevent-media-session") {
			for (const action of ACTIONS) setHandler(s, action, () => {});
			return () => {
				for (const action of ACTIONS) setHandler(s, action, null);
			};
		}
		const seekBy = (seconds: number) =>
			store.seekTo(store.getSnapshot().frame + Math.round(seconds * fps));
		setHandler(s, "play", () => store.play());
		setHandler(s, "pause", () => store.pause());
		setHandler(s, "previoustrack", () => store.seekTo(0));
		setHandler(s, "seekforward", () => seekBy(SEEK_SECONDS));
		setHandler(s, "seekbackward", () => seekBy(-SEEK_SECONDS));
		const report = () => {
			const snap = store.getSnapshot();
			s.playbackState = snap.playing ? "playing" : "paused";
			if (typeof s.setPositionState === "function") {
				const duration = durationInFrames / fps;
				try {
					s.setPositionState({
						duration,
						position: Math.min(duration, snap.frame / fps),
						playbackRate,
					});
				} catch (error) {
					console.warn("Could not report the Player position to the media session:", error);
				}
			}
		};
		report();
		const unsubscribe = store.subscribe(report);
		return () => {
			unsubscribe();
			for (const action of ACTIONS) setHandler(s, action, null);
			s.playbackState = "none";
		};
	}, [store, mode, fps, durationInFrames, playbackRate]);
}
