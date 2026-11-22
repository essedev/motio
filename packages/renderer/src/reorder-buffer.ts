/**
 * Puts items that arrive in any order back in sequence and hands them to a writer one at a
 * time, in order. `push` waits while the item is `window` or more positions ahead of the next
 * one to write, which bounds memory; the item at the head is always accepted, so a producer
 * holding it can never be blocked. With requests issued in ascending order this cannot
 * deadlock; callers issuing requests in another order must pass `window = Infinity`.
 */
export class ReorderBuffer<T> {
	private readonly pending = new Map<number, T>();
	private next = 0;
	private written = 0;
	private writing = false;
	private error: unknown;
	private readonly spaceWaiters: (() => void)[] = [];
	private readonly doneWaiters: { resolve: () => void; reject: (e: unknown) => void }[] = [];

	constructor(
		private readonly total: number,
		private readonly write: (index: number, item: T) => Promise<void>,
		private readonly window: number = Number.POSITIVE_INFINITY,
	) {
		if (!(window >= 1)) throw new RangeError(`window must be at least 1, got ${window}`);
	}

	/** Items written so far. */
	get writtenCount(): number {
		return this.written;
	}

	/** Items held, waiting for an earlier one. */
	get bufferedCount(): number {
		return this.pending.size;
	}

	/** Adds the item at position `index` (0-based); resolves once it is buffered. */
	async push(index: number, item: T): Promise<void> {
		if (!Number.isInteger(index) || index < 0 || index >= this.total) {
			throw new RangeError(`index ${index} is outside [0, ${this.total})`);
		}
		while (this.error === undefined && index - this.next >= this.window) {
			await new Promise<void>((ok) => this.spaceWaiters.push(ok));
		}
		if (this.error !== undefined) throw this.error;
		if (index < this.next || this.pending.has(index)) {
			throw new Error(`index ${index} was pushed twice`);
		}
		this.pending.set(index, item);
		this.drain();
	}

	/** Resolves when all `total` items are written; rejects if writing failed or was aborted. */
	done(): Promise<void> {
		if (this.error !== undefined) return Promise.reject(this.error);
		if (this.written === this.total) return Promise.resolve();
		return new Promise((resolve, reject) => this.doneWaiters.push({ resolve, reject }));
	}

	/** Stops writing, drops buffered items and rejects every waiter with `err`. */
	abort(err: unknown): void {
		if (this.error !== undefined) return;
		this.error = err;
		this.pending.clear();
		for (const w of this.spaceWaiters.splice(0)) w();
		for (const w of this.doneWaiters.splice(0)) w.reject(err);
	}

	private drain(): void {
		if (this.writing) return;
		this.writing = true;
		void (async () => {
			try {
				while (this.error === undefined && this.pending.has(this.next)) {
					const index = this.next;
					const item = this.pending.get(index) as T;
					this.pending.delete(index);
					this.next++;
					for (const w of this.spaceWaiters.splice(0)) w();
					await this.write(index, item);
					this.written++;
				}
				if (this.error === undefined && this.written === this.total) {
					for (const w of this.doneWaiters.splice(0)) w.resolve();
				}
			} catch (err) {
				this.abort(err);
			} finally {
				this.writing = false;
			}
			// An item may have arrived while the last write was finishing.
			if (this.error === undefined && this.pending.has(this.next)) this.drain();
		})();
	}
}
