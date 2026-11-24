import type { FrameWarning } from "./protocol.js";

/**
 * Warnings about the composition found outside the per-frame checks of the page runtime: a
 * `staticFile()` whose case differs from the file, a timeline shorter than the composition. The
 * render page drains them into the next `FrameReport`; the preview can list them.
 */
export class PageWarningRegistry {
	private readonly seen = new Set<string>();
	private readonly all: FrameWarning[] = [];
	private pending: FrameWarning[] = [];
	private readonly listeners = new Set<() => void>();

	/**
	 * Records a warning; the same code and message are recorded once per page. Returns true when
	 * the warning is new.
	 */
	report(warning: FrameWarning): boolean {
		const key = `${warning.code}\u0000${warning.message}`;
		if (this.seen.has(key)) return false;
		this.seen.add(key);
		this.all.push(warning);
		this.pending.push(warning);
		for (const listener of this.listeners) listener();
		return true;
	}

	/** Every warning recorded on this page, in order. */
	list(): FrameWarning[] {
		return [...this.all];
	}

	/** Returns and forgets the warnings recorded since the last call. */
	take(): FrameWarning[] {
		const out = this.pending;
		this.pending = [];
		return out;
	}

	/** Calls `listener` after each new warning; returns the unsubscribe function. */
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/** Forgets everything. For tests. */
	reset(): void {
		this.seen.clear();
		this.all.length = 0;
		this.pending = [];
	}
}

const REGISTRY_KEY = Symbol.for("motio.pageWarnings");

/** The page-wide warning registry, shared by every copy of this module on the page. */
export const pageWarnings: PageWarningRegistry = (() => {
	const g = globalThis as Record<symbol, unknown>;
	const existing = g[REGISTRY_KEY];
	if (existing && typeof existing === "object") return existing as PageWarningRegistry;
	const created = new PageWarningRegistry();
	g[REGISTRY_KEY] = created;
	return created;
})();
