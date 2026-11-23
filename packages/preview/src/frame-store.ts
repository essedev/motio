import type { CallbackListener, PlayerRef } from "@motiojs/player";

/** The playback state the toolbar shows, fed by the Player's events. */
export interface PlaybackSnapshot {
	frame: number;
	playing: boolean;
}

/**
 * Follows a `PlayerRef` through its events so only the components that show the frame
 * re-render during playback, not the whole page.
 */
export class FrameStore {
	private snapshot: PlaybackSnapshot;
	private readonly listeners = new Set<() => void>();
	private player: PlayerRef | null = null;
	private detach: (() => void) | null = null;

	constructor(initialFrame = 0) {
		this.snapshot = { frame: initialFrame, playing: false };
	}

	/** Attaches to a mounted Player, or detaches with null. Use it as a callback ref. */
	readonly attach = (player: PlayerRef | null): void => {
		if (player === this.player) return;
		this.detach?.();
		this.detach = null;
		this.player = player;
		if (!player) return;
		const onFrame: CallbackListener<"frameupdate"> = ({ detail }) =>
			this.set({ frame: detail.frame });
		const onSeeked: CallbackListener<"seeked"> = ({ detail }) => this.set({ frame: detail.frame });
		const onPlay = () => this.set({ playing: true });
		const onPause = () => this.set({ playing: false, frame: player.getCurrentFrame() });
		player.addEventListener("frameupdate", onFrame);
		player.addEventListener("seeked", onSeeked);
		player.addEventListener("play", onPlay);
		player.addEventListener("pause", onPause);
		player.addEventListener("ended", onPause);
		this.detach = () => {
			player.removeEventListener("frameupdate", onFrame);
			player.removeEventListener("seeked", onSeeked);
			player.removeEventListener("play", onPlay);
			player.removeEventListener("pause", onPause);
			player.removeEventListener("ended", onPause);
		};
		this.set({ frame: player.getCurrentFrame(), playing: player.isPlaying() });
	};

	/** The attached Player, or null. */
	current(): PlayerRef | null {
		return this.player;
	}

	get = (): PlaybackSnapshot => this.snapshot;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	private set(patch: Partial<PlaybackSnapshot>): void {
		const next = { ...this.snapshot, ...patch };
		if (next.frame === this.snapshot.frame && next.playing === this.snapshot.playing) return;
		this.snapshot = next;
		for (const listener of this.listeners) listener();
	}
}
