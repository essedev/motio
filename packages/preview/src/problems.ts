import { readiness, realTimers } from "@motiojs/core/internals";

/** Something in the composition that a render would trip on, shown in the Problems panel. */
export type Problem =
	| { kind: "load"; key: string; url: string; what: string; status: number | null }
	| {
			kind: "delay";
			key: string;
			label: string | null;
			elapsedMs: number;
			timeoutMs: number;
			stack: string | undefined;
	  }
	| { kind: "cancelled"; key: string; message: string; code: string | null; url: string | null }
	| { kind: "warning"; key: string; code: string; message: string };

/** How often open `delayRender()` handles are read: their elapsed time is shown. */
const POLL_MS = 500;

/** Requests of the page itself, never the composition's. */
const OWN_PATHS = /^\/(__motio\/|@vite\/|@react-refresh|@id\/|@fs\/|node_modules\/\.vite\/)/;
/** Modules of the project: a failure is a build error, which the page shows on its own. */
const MODULE_PATH = /\.([cm]?[jt]sx?|vue|svelte)$/;

const PAGE_WARNINGS_KEY = Symbol.for("motio.pageWarnings");

interface WarningSource {
	list(): Array<{ code: string; message: string }>;
	subscribe(listener: () => void): () => void;
}

/**
 * The page warnings core reports outside renders (a `staticFile()` whose case differs from the
 * file, a timeline shorter than the composition), read from their page-wide registry if this
 * version of core has one.
 */
function pageWarnings(): WarningSource | null {
	const value = (globalThis as Record<symbol, unknown>)[PAGE_WARNINGS_KEY] as
		| Partial<WarningSource>
		| undefined;
	return value && typeof value.list === "function" && typeof value.subscribe === "function"
		? (value as WarningSource)
		: null;
}

function describeElement(target: EventTarget | null): { url: string; what: string } | null {
	if (typeof Element === "undefined" || !(target instanceof Element)) return null;
	const tag = target.tagName.toLowerCase();
	const url =
		(target as HTMLMediaElement).currentSrc ||
		target.getAttribute("src") ||
		(tag === "link" ? target.getAttribute("href") : null);
	if (!url) return null;
	const what =
		tag === "img" || tag === "image"
			? "Image"
			: tag === "video"
				? "Video"
				: tag === "audio"
					? "Audio"
					: tag === "link"
						? "Stylesheet or font"
						: tag === "script"
							? "Script"
							: tag === "source" || tag === "track"
								? "Media source"
								: "File";
	return { url, what };
}

/** The URL an asset error names (`details.url`, else `details.path`), absolute. */
function errorUrl(error: Error): string | null {
	const details = (error as Error & { details?: { url?: unknown; path?: unknown } }).details;
	const url = typeof details?.url === "string" ? details.url : null;
	const path = typeof details?.path === "string" ? details.path : null;
	return absolute(url ?? path);
}

function absolute(url: string | null): string | null {
	if (!url) return null;
	try {
		return new URL(url, location.href).href;
	} catch {
		return url;
	}
}

function errorCode(error: Error): string | null {
	const code = (error as Error & { code?: unknown }).code;
	return typeof code === "string" ? code : null;
}

function resourceKind(initiator: string, url: string): string {
	if (/\.(woff2?|ttf|otf)(\?|$)/i.test(url)) return "Font";
	if (initiator === "img" || initiator === "image") return "Image";
	if (initiator === "video" || initiator === "audio") return "Media";
	if (initiator === "css" || initiator === "link") return "Stylesheet or font";
	return "Request";
}

/** A path for display: same-origin URLs lose the origin. */
export function displayUrl(url: string): string {
	try {
		const parsed = new URL(url, location.href);
		if (parsed.origin !== location.origin) return parsed.href;
		return decodeURIComponent(parsed.pathname + parsed.search);
	} catch {
		return url;
	}
}

function isOwnRequest(url: string): boolean {
	try {
		const parsed = new URL(url, location.href);
		return (
			parsed.origin === location.origin &&
			(OWN_PATHS.test(parsed.pathname) || MODULE_PATH.test(parsed.pathname))
		);
	} catch {
		return false;
	}
}

/**
 * Collects the problems of the composition shown in the preview: files that failed to load
 * (elements' error events and, where the browser reports it, HTTP errors of any request), open
 * `delayRender()` handles with their age, a `cancelRender()`, and core's page warnings. A render
 * of the same composition would hang or fail on each of them, while the Player plays on.
 *
 * `reset()` scopes the list to the composition just selected: handles and loads from before
 * are dropped, since the registries are page-wide.
 */
export class ProblemCollector {
	private loads = new Map<string, Problem & { kind: "load" }>();
	private delays: Problem[] = [];
	private cancelled: Problem | null = null;
	private since = 0;
	private sinceTimeline = 0;
	private cancellationAtReset: Error | null = null;
	private snapshot: Problem[] = [];
	private readonly listeners = new Set<() => void>();
	private stop: (() => void) | null = null;

	/** Starts listening; returns the function that stops. */
	start(): () => void {
		if (this.stop) return this.stop;
		const onError = (event: Event) => {
			const element = describeElement(event.target);
			if (element) this.addLoad(element.url, element.what, null);
		};
		window.addEventListener("error", onError, true);
		let observer: PerformanceObserver | null = null;
		if (typeof PerformanceObserver !== "undefined") {
			try {
				observer = new PerformanceObserver((list) => {
					for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
						// `responseStatus` is Chrome 109+; a cross-origin request reports 0.
						const status = (entry as { responseStatus?: number }).responseStatus ?? 0;
						if (status >= 400 && entry.startTime >= this.sinceTimeline) {
							this.addLoad(entry.name, resourceKind(entry.initiatorType, entry.name), status);
						}
					}
				});
				observer.observe({ type: "resource", buffered: false });
			} catch {
				observer = null;
			}
		}
		const timer = setInterval(() => this.poll(), POLL_MS);
		const unsubscribeWarnings = pageWarnings()?.subscribe(() => this.publish()) ?? null;
		this.poll();
		this.stop = () => {
			window.removeEventListener("error", onError, true);
			observer?.disconnect();
			clearInterval(timer);
			unsubscribeWarnings?.();
			this.stop = null;
		};
		return this.stop;
	}

	/**
	 * Forgets what happened before: a new composition is about to render. Call it before the
	 * composition renders (its `delayRender()` calls run during that render), then
	 * {@link refresh} once the page has rendered.
	 */
	scope(): void {
		this.loads.clear();
		this.since = realTimers().now();
		this.sinceTimeline = performance.now();
		this.cancellationAtReset = readiness.cancelled();
		this.cancelled = null;
	}

	/** Reads the registries now and tells the listeners. */
	refresh(): void {
		this.poll();
		this.publish();
	}

	get = (): Problem[] => this.snapshot;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	private addLoad(url: string, what: string, status: number | null): void {
		if (isOwnRequest(url)) return;
		const existing = this.loads.get(url);
		if (existing && (existing.status !== null || status === null)) return;
		this.loads.set(url, {
			kind: "load",
			key: `load:${url}`,
			url,
			// An element's error names what it was; a status from the resource timing is extra.
			what: existing?.what ?? what,
			status,
		});
		this.publish();
	}

	private poll(): void {
		const now = realTimers().now();
		const delays: Problem[] = readiness
			.openHandles()
			.filter((handle) => handle.openedAt >= this.since)
			.map((handle) => ({
				kind: "delay",
				key: `delay:${handle.id}`,
				label: handle.label,
				elapsedMs: now - handle.openedAt,
				timeoutMs: handle.timeoutMs,
				stack: handle.stack,
			}));
		const cancellation = readiness.cancelled();
		const cancelled: Problem | null =
			cancellation && cancellation !== this.cancellationAtReset
				? {
						kind: "cancelled",
						key: "cancelled",
						message: cancellation.message,
						code: errorCode(cancellation),
						url: errorUrl(cancellation),
					}
				: null;
		const changed =
			delays.length !== this.delays.length ||
			delays.some((d, i) => {
				const previous = this.delays[i];
				return (
					previous?.key !== d.key ||
					Math.floor((d as { elapsedMs: number }).elapsedMs / 1000) !==
						Math.floor((previous as { elapsedMs: number }).elapsedMs / 1000)
				);
			}) ||
			(cancelled?.message ?? null) !== (this.cancelled as { message?: string } | null)?.message;
		this.delays = delays;
		this.cancelled = cancelled;
		if (changed) this.publish();
	}

	private publish(): void {
		const warnings: Problem[] = (pageWarnings()?.list() ?? []).map((w) => ({
			kind: "warning",
			key: `warning:${w.code}:${w.message}`,
			code: w.code,
			message: w.message,
		}));
		// The asset a cancelRender() names is listed once, under the cancellation.
		const cancelledUrl = (this.cancelled as { url?: string | null } | null)?.url ?? null;
		const loads = [...this.loads.values()].filter((load) => absolute(load.url) !== cancelledUrl);
		this.snapshot = [
			...(this.cancelled ? [this.cancelled] : []),
			...loads,
			...this.delays,
			...warnings,
		];
		for (const listener of [...this.listeners]) listener();
	}
}
