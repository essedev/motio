/** A listener receiving `{ detail }`, the shape `PlayerRef` listeners get. */
type Listener<D> = (data: { detail: D }) => void;

function report(error: unknown): void {
	// A throwing listener must not stop the other listeners or the playback loop, but the error
	// must still surface: hand it to the host's global error reporting.
	const g = globalThis as { reportError?: (e: unknown) => void };
	if (typeof g.reportError === "function") g.reportError(error);
	else
		setTimeout(() => {
			throw error;
		}, 0);
}

/** A typed event emitter whose listeners receive `{ detail }`. */
export class PlayerEmitter<Events extends object> {
	private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

	addEventListener<K extends keyof Events>(name: K, callback: Listener<Events[K]>): void {
		if (typeof callback !== "function") {
			throw new TypeError(
				`addEventListener("${String(name)}") expects a function, got ${typeof callback}`,
			);
		}
		let set = this.listeners.get(name);
		if (!set) {
			set = new Set();
			this.listeners.set(name, set);
		}
		set.add(callback as Listener<never>);
	}

	removeEventListener<K extends keyof Events>(name: K, callback: Listener<Events[K]>): void {
		this.listeners.get(name)?.delete(callback as Listener<never>);
	}

	/** Calls every listener of `name` with `{ detail }`; a throwing listener is reported. */
	dispatch<K extends keyof Events>(name: K, detail: Events[K]): void {
		const set = this.listeners.get(name);
		if (!set || set.size === 0) return;
		for (const cb of [...set]) {
			try {
				(cb as Listener<Events[K]>)({ detail });
			} catch (error) {
				report(error);
			}
		}
	}
}
