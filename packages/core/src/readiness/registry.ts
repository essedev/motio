import { getRunContext } from "../environment.js";
import { realTimers } from "../real-time.js";

/** Default readiness timeout when the run context does not set one (Remotion's default). */
export const DEFAULT_READINESS_TIMEOUT_MS = 30_000;

/** An open readiness handle. */
export interface ReadinessHandle {
	id: number;
	/** The label passed to `delayRender()`, or null. */
	label: string | null;
	/** Real time (ms, monotonic) when the handle was opened. */
	openedAt: number;
	timeoutMs: number;
	/** How many times the renderer may retry the frame on a fresh page after a timeout. */
	retries: number;
	/** Where `delayRender()` was called, for timeout messages. */
	stack: string | undefined;
}

/** A handle that stayed open longer than its timeout. */
export interface ExpiredHandle extends ReadinessHandle {
	elapsedMs: number;
}

/** A handle closed during the current observation window, with how long it stayed open. */
export interface ClosedHandle {
	label: string | null;
	openMs: number;
	timeoutMs: number;
}

/**
 * The page-wide registry of readiness handles. Timeouts are measured on real time and are
 * checked by the runtime's settle loop, never by user-visible timers.
 */
export class ReadinessRegistry {
	private readonly open = new Map<number, ReadinessHandle>();
	private closed: ClosedHandle[] = [];
	private nextId = 1;
	private cancellation: Error | null = null;

	/** Default timeout for new handles: the run context's, else 30 s. */
	defaultTimeoutMs(): number {
		const fromContext = getRunContext()?.readinessTimeoutMs;
		return typeof fromContext === "number" && fromContext > 0
			? fromContext
			: DEFAULT_READINESS_TIMEOUT_MS;
	}

	add(label: string | null, timeoutMs: number | undefined, retries: number): number {
		const id = this.nextId++;
		this.open.set(id, {
			id,
			label,
			openedAt: realTimers().now(),
			timeoutMs: timeoutMs ?? this.defaultTimeoutMs(),
			retries,
			stack: new Error().stack,
		});
		return id;
	}

	/** Closes a handle; unknown or already closed handles are ignored. */
	remove(id: number): void {
		const h = this.open.get(id);
		if (!h) return;
		this.open.delete(id);
		this.closed.push({
			label: h.label,
			openMs: realTimers().now() - h.openedAt,
			timeoutMs: h.timeoutMs,
		});
	}

	/** Records a cancellation and closes every handle so nothing keeps waiting. */
	cancel(error: Error): void {
		if (!this.cancellation) this.cancellation = error;
		for (const id of [...this.open.keys()]) this.remove(id);
	}

	/** The error passed to `cancelRender()`, if any. */
	cancelled(): Error | null {
		return this.cancellation;
	}

	openHandles(): ReadinessHandle[] {
		return [...this.open.values()];
	}

	get size(): number {
		return this.open.size;
	}

	/** The first open handle whose timeout elapsed, by real time. */
	expired(now = realTimers().now()): ExpiredHandle | null {
		for (const h of this.open.values()) {
			const elapsedMs = now - h.openedAt;
			if (elapsedMs >= h.timeoutMs) return { ...h, elapsedMs };
		}
		return null;
	}

	/** Returns and forgets the handles closed since the last call. */
	takeClosed(): ClosedHandle[] {
		const out = this.closed;
		this.closed = [];
		return out;
	}

	/** Forgets everything. For tests and fresh mounts. */
	reset(): void {
		this.open.clear();
		this.closed = [];
		this.cancellation = null;
		this.nextId = 1;
	}
}

const REGISTRY_KEY = Symbol.for("motio.readiness");

/**
 * The registry shared by every readiness call on the page. Kept on `globalThis` so that two
 * copies of this module in one bundle still share one registry.
 */
export const readiness: ReadinessRegistry = (() => {
	const g = globalThis as Record<symbol, unknown>;
	const existing = g[REGISTRY_KEY];
	// Duck-typed: a second copy of this module has its own class object.
	if (existing && typeof existing === "object") return existing as ReadinessRegistry;
	const created = new ReadinessRegistry();
	g[REGISTRY_KEY] = created;
	return created;
})();
