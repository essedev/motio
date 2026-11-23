import type { AudioIntent } from "../protocol.js";

/** An intent as a component reports it; the registry assigns the `id`. */
export type AudioIntentInput = Omit<AudioIntent, "id">;

function key(i: AudioIntentInput): string {
	return JSON.stringify([
		i.src,
		i.sourceFrame,
		i.playbackRate,
		i.toneFrequency,
		i.preservePitch,
		i.audioStreamIndex,
	]);
}

/**
 * The audio intents of the frame being rendered. Media components set their intent in a layout
 * effect on every render and remove it on unmount; the page runtime reads the snapshot once the
 * frame settled and returns it in `FrameReport.audio`.
 *
 * React's `useId` is not stable across pages (client ids count mounts), so intents carry no
 * component identity. Two intents that differ only in volume play the same samples, so which
 * one is which does not change the mix; they are numbered in volume order for determinism.
 */
export class AudioIntentRegistry {
	private readonly intents = new Map<object, AudioIntentInput>();

	/** Sets or replaces the intent of the component instance identified by `owner`. */
	set(owner: object, intent: AudioIntentInput): void {
		this.intents.set(owner, intent);
	}

	/** Removes the intent of a component instance, if any. */
	delete(owner: object): void {
		this.intents.delete(owner);
	}

	/** The intents currently set, in a deterministic order, with their ids. */
	snapshot(): AudioIntent[] {
		const sorted = [...this.intents.values()]
			.map((i) => ({ i, k: key(i) }))
			.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : a.i.volume - b.i.volume));
		const seen = new Map<string, number>();
		return sorted.map(({ i, k }) => {
			const n = seen.get(k) ?? 0;
			seen.set(k, n + 1);
			return { id: String(n), ...i };
		});
	}

	/** Number of intents set. */
	get size(): number {
		return this.intents.size;
	}

	/** Removes every intent. */
	clear(): void {
		this.intents.clear();
	}
}

/** The page-wide registry the media components and the page runtime share. */
export const audioIntents = new AudioIntentRegistry();
