import { createContext, useContext } from "react";

/**
 * A pool of `<audio>` elements the Player mounts up front and unlocks on the first user gesture,
 * so media mounted later may still play where browsers require a gesture (Remotion's
 * `numberOfSharedAudioTags`). Media components borrow an element instead of creating their own.
 */
export interface SharedAudioPool {
	/** Number of elements in the pool. */
	readonly size: number;
	/**
	 * Takes a free element. Throws when every element is in use, as Remotion does when more
	 * audio tags mount than `numberOfSharedAudioTags`.
	 */
	acquire(owner: string): HTMLAudioElement;
	/** Returns an element to the pool, stopped and without a source. */
	release(element: HTMLAudioElement): void;
}

/**
 * How native media elements should play in a preview, provided by the Player around the
 * composition. Absent during a render and outside a Player, where media elements stay paused on
 * the current frame.
 */
export interface MediaPlayback {
	/** The Player is playing and not buffering: native elements play on the real clock. */
	playing: boolean;
	/** The Player's playback rate; multiplied with each element's own rate. */
	playbackRate: number;
	/** The Player's volume, 0 to 1; multiplied with each element's own volume. */
	volume: number;
	/** The Player is muted. */
	muted: boolean;
	/** Shared audio elements, or null when the Player was given `numberOfSharedAudioTags={0}`. */
	sharedAudio: SharedAudioPool | null;
}

/** Provided by the Player; null during a render. */
export const MediaPlaybackContext = createContext<MediaPlayback | null>(null);

/** The media playback state of the enclosing Player, or null. */
export function useMediaPlayback(): MediaPlayback | null {
	return useContext(MediaPlaybackContext);
}
