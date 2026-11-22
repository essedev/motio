import type { BufferState } from "@motiojs/core";
import type { BufferHandle } from "@motiojs/core/internals";

/**
 * Counts open `delayPlayback()` handles. Calls `onChange(true)` when the first one opens and
 * `onChange(false)` when the last one is released.
 */
export class BufferTracker {
	private open = 0;
	readonly state: BufferState;

	constructor(private readonly onChange: (buffering: boolean) => void) {
		this.state = { delayPlayback: () => this.delayPlayback() };
	}

	get buffering(): boolean {
		return this.open > 0;
	}

	private delayPlayback(): BufferHandle {
		let released = false;
		this.open++;
		if (this.open === 1) this.onChange(true);
		return {
			unblock: () => {
				if (released) return;
				released = true;
				this.open--;
				if (this.open === 0) this.onChange(false);
			},
		};
	}
}
