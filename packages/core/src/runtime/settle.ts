import type { FrameWarning, PageError } from "../protocol.js";
import type { ReadinessRegistry } from "../readiness/registry.js";
import { realMacrotask, realTimers } from "../real-time.js";
import { toPageError } from "./page-error.js";

/** Consecutive quiet yields (no handle, no mutation) required to call a frame settled. */
export const QUIET_YIELDS = 2;

/** How long one wait on fonts or images lasts before the loop checks timeouts again. */
const POLL_MS = 50;

/** Inputs of `settle()`. */
export interface SettleOptions {
	registry: ReadinessRegistry;
	/** Subtree observed for mutations and images. */
	root: Element;
	/** Frame being settled, for error context. */
	frame?: number;
	/** Returns and clears an error captured from React since the last call. */
	takeRenderError: () => unknown;
	/** Remembers which image source each element already decoded. */
	images: ImageTracker;
	/** Timeout for an image to load, in real milliseconds. */
	imageTimeoutMs: number;
}

/** Result of a settled frame. */
export interface SettleResult {
	settleMs: number;
	warnings: FrameWarning[];
}

/** Tracks image decoding across frames, so each source is waited for once per element. */
export class ImageTracker {
	private readonly decoded = new WeakMap<HTMLImageElement, string>();
	private readonly pending = new Map<
		HTMLImageElement,
		{ src: string; since: number; done: Promise<void> }
	>();

	/** Starts decoding new images under `root`; returns the pending ones. */
	scan(
		root: Element,
	): Array<{ img: HTMLImageElement; src: string; since: number; done: Promise<void> }> {
		const now = realTimers().now();
		for (const img of root.querySelectorAll("img")) {
			const src = img.currentSrc || img.getAttribute("src") || "";
			if (!src || this.decoded.get(img) === src) continue;
			const current = this.pending.get(img);
			if (current && current.src === src) continue;
			if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) {
				// Broken image: nothing to wait for. `<Img>` reports its own errors.
				this.decoded.set(img, src);
				continue;
			}
			if (img.loading === "lazy" && !img.complete) continue;
			const decode: Promise<unknown> =
				typeof img.decode === "function"
					? img.decode()
					: new Promise<void>((resolve) => {
							if (img.complete) resolve();
							else {
								img.addEventListener("load", () => resolve(), { once: true });
								img.addEventListener("error", () => resolve(), { once: true });
							}
						});
			const done = decode.then(
				() => this.finish(img, src),
				() => this.finish(img, src),
			);
			this.pending.set(img, { src, since: now, done });
		}
		for (const [img, p] of this.pending) {
			if (!img.isConnected) this.pending.delete(img);
			else if (this.decoded.get(img) === p.src) this.pending.delete(img);
		}
		return [...this.pending].map(([img, p]) => ({ img, ...p }));
	}

	private finish(img: HTMLImageElement, src: string): void {
		this.decoded.set(img, src);
		const p = this.pending.get(img);
		if (p && p.src === src) this.pending.delete(img);
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		realTimers().setTimeout(resolve, ms);
	});
}

function handleTimeoutMessage(label: string | null, timeoutMs: number, frame?: number): string {
	const what = label === null ? "A delayRender()" : `A delayRender() "${label}"`;
	const at = frame === undefined ? "" : ` while rendering frame ${frame}`;
	return `${what} was called but not cleared after ${Math.round(timeoutMs)}ms${at}. Call continueRender() with its handle, or raise timeoutInMilliseconds.`;
}

/**
 * Waits on real macrotasks until no readiness handle is open, the DOM under `root` did not change
 * for two consecutive yields, fonts are loaded and every new image is decoded (ARCHITECTURE,
 * seek step 5). React's scheduler processes non-sync updates during these yields. Rejects with a
 * `PageError` on a timeout, a cancellation or a render error.
 */
export async function settle(options: SettleOptions): Promise<SettleResult> {
	const { registry, root, frame, images } = options;
	const real = realTimers();
	const start = real.now();
	let mutations = 0;
	const observer =
		typeof MutationObserver === "function"
			? new MutationObserver((records) => {
					mutations += records.length;
				})
			: null;
	observer?.observe(root, {
		subtree: true,
		childList: true,
		attributes: true,
		characterData: true,
	});
	const fail = (error: PageError): never => {
		throw error;
	};
	const extra = frame === undefined ? {} : { frame };
	try {
		let quiet = 0;
		for (;;) {
			await realMacrotask();
			if (observer) mutations += observer.takeRecords().length;
			const cancelled = registry.cancelled();
			if (cancelled) fail(toPageError("E_CANCELLED", cancelled, extra));
			const renderError = options.takeRenderError();
			if (renderError !== undefined) fail(toPageError("E_RENDER_ERROR", renderError, extra));
			const expired = registry.expired(real.now());
			if (expired) {
				fail(
					toPageError(
						"E_READINESS_TIMEOUT",
						handleTimeoutMessage(expired.label, expired.timeoutMs, frame),
						{
							...extra,
							...(expired.label === null ? {} : { label: expired.label }),
							retries: expired.retries,
						},
					),
				);
			}
			if (registry.size > 0 || mutations > 0) {
				quiet = 0;
				mutations = 0;
				continue;
			}
			if (typeof document !== "undefined" && document.fonts && document.fonts.status !== "loaded") {
				quiet = 0;
				await Promise.race([document.fonts.ready, delay(POLL_MS)]);
				continue;
			}
			const pending = images.scan(root);
			if (pending.length > 0) {
				const now = real.now();
				const late = pending.find((p) => now - p.since >= options.imageTimeoutMs);
				if (late) {
					fail(
						toPageError(
							"E_READINESS_TIMEOUT",
							`The image ${late.src} did not load within ${options.imageTimeoutMs}ms${frame === undefined ? "" : ` while rendering frame ${frame}`}.`,
							{ ...extra, label: `<img src=${late.src}>` },
						),
					);
				}
				quiet = 0;
				await Promise.race([Promise.all(pending.map((p) => p.done)), delay(POLL_MS)]);
				continue;
			}
			quiet++;
			if (quiet >= QUIET_YIELDS) break;
		}
	} finally {
		observer?.disconnect();
	}
	const warnings: FrameWarning[] = [];
	for (const closed of registry.takeClosed()) {
		if (closed.openMs >= closed.timeoutMs / 2) {
			warnings.push({
				code: "W_SLOW_READINESS",
				message: `${closed.label === null ? "A delayRender() handle" : `The delayRender() handle "${closed.label}"`} stayed open for ${Math.round(closed.openMs)}ms, more than half of its ${closed.timeoutMs}ms timeout.`,
			});
		}
	}
	return { settleMs: real.now() - start, warnings };
}
