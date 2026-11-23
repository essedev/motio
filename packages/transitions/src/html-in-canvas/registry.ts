/**
 * Hands the rasterised exiting scene of an HTML-in-canvas transition to the entering scene, which
 * draws both. One registry per `<TransitionSeries>`; images are keyed by transition and stamped
 * with the frame they were captured for, so a scene never blends with a stale image.
 */
export class HtmlInCanvasRegistry {
	readonly #images = new Map<string, { image: OffscreenCanvas; token: number }>();
	readonly #listeners = new Map<string, Set<() => void>>();

	/** Stores the exiting scene of transition `key`, captured for frame `token`. */
	publish(key: string, image: OffscreenCanvas, token: number): void {
		this.#images.set(key, { image, token });
		for (const listener of this.#listeners.get(key) ?? []) listener();
	}

	/** The exiting scene of transition `key` captured for frame `token`, if there is one. */
	get(key: string, token: number): OffscreenCanvas | null {
		const entry = this.#images.get(key);
		return entry && entry.token === token ? entry.image : null;
	}

	/** Calls `listener` whenever the exiting scene of `key` is captured again. */
	subscribe(key: string, listener: () => void): () => void {
		let set = this.#listeners.get(key);
		if (!set) {
			set = new Set();
			this.#listeners.set(key, set);
		}
		set.add(listener);
		return () => {
			set.delete(listener);
		};
	}
}
