import { randomUUID } from "node:crypto";
import { CLOCK_SHIM_SCRIPT } from "@motiojs/core/clock-shim";
import {
	type CompositionInfo,
	type FrameReport,
	PAGE_API_GLOBAL,
	type PageError,
	type PendingHandle,
	PROTOCOL_VERSION,
	type ResolvedComposition,
	RUN_CONTEXT_GLOBAL,
	type RunContext,
	type SetCompositionOptions,
	type TimeModel,
} from "@motiojs/core/protocol";
import type { Browser, CDPSession, Page } from "puppeteer-core";
import { type BrowserLease, type BrowserPool, killBrowser } from "./browser/browser-pool.js";
import type { ChromiumOptions } from "./browser/flags.js";
import { type LaunchOptions, launchArgs, launchBrowser } from "./browser/launch.js";
import type { BrowserLog, BrowserLogType } from "./browser-log.js";
import { BEGIN_FRAME_ATTEMPTS, type CaptureMethod } from "./capture-method.js";
import { MotioError, type MotioErrorCode } from "./errors.js";
import type { StackMapper } from "./stack-map.js";
import type { PendingDelayRender, RenderWarning } from "./warnings.js";

/** Everything needed to open a page on a bundle. */
export interface PageConfig {
	executablePath: string;
	serveUrl: string;
	chromiumOptions: ChromiumOptions;
	inputProps: Record<string, unknown>;
	envVariables: Record<string, string>;
	timeoutInMilliseconds: number;
	width: number;
	height: number;
	scale: number;
	/** Transparent default background, for PNG capture with alpha. */
	transparent: boolean;
	onBrowserLog: ((log: BrowserLog) => void) | undefined;
	/** Base URL of the renderer's media service, passed to the page in the run context. */
	mediaBaseUrl?: string;
	/** Capture path (D-013). Default `screenshot`. */
	captureMethod?: CaptureMethod;
	/** Time model of the page (ARCHITECTURE, "Time"). Default `frame`. */
	timeModel?: TimeModel;
	/**
	 * Browsers shared with other pages of the session (D-042). Without it the page launches its own
	 * browser and kills it on close.
	 */
	browsers?: { pool: BrowserPool; pagesPerBrowser: number };
	/** Maps page stack traces to the project's sources; errors keep the raw stack without it. */
	stackMapper?: StackMapper;
	/** Receives the warnings of every frame the page renders. */
	onWarnings?: (warnings: readonly RenderWarning[], frame: number) => void;
	/** Called every `pendingReportMs` for each `delayRender()` handle a page call waits on. */
	onDelayRenderPending?: ((pending: PendingDelayRender) => void) | undefined;
	/** Interval of `onDelayRenderPending`. Default `PENDING_REPORT_MS`. */
	pendingReportMs?: number;
}

/**
 * Most frames the page steps through in one call while warming up in the virtual time model
 * (ARCHITECTURE, "Time"): each call stays well within the watchdog, whatever the frame.
 */
export const VIRTUAL_STEPS_PER_CALL = 30;

/** How often the open `delayRender()` handles of a slow page call are reported. */
export const PENDING_REPORT_MS = 5_000;

/**
 * While a page call is in flight on a BeginFrame page, frames without display updates are sent
 * at this interval so `requestAnimationFrame` callbacks keep running: under BeginFrame control
 * the compositor produces no frame on its own.
 */
export const BEGIN_FRAME_PUMP_MS = 16;

/** Resource types a BeginFrame capture waits for: those style and layout request. */
const TRACKED_RESOURCES = new Set(["Image", "Font", "Stylesheet"]);

/**
 * Installed in an isolated world of every page (ARCHITECTURE, "Raster reset"): `hide()` makes the
 * document invisible, `show()` restores its own opacity, and `hideForOneFrame()` hides it until a
 * frame was painted hidden.
 *
 * Blink skips the raster invalidation of a transform change below 0.01 px of translation or 1e-4
 * in the other matrix components and keeps the transform it last rasterised with as the
 * reference, and Chrome keeps the raster scale of a layer with `will-change: transform`: without
 * a reset, the pixels of a frame depend on the frames the page rendered before it. Content that
 * was invisible on the previous paint is invalidated in full when it shows again, so the next
 * frame is rasterised as on a fresh page. A task queued from an animation frame callback runs
 * once that frame was painted. In the isolated world `requestAnimationFrame` and `setTimeout` are
 * the browser's own even when page code replaced them, and nothing is left on the page's globals.
 */
const RASTER_RESET_WORLD = `(() => {
	let saved = null;
	globalThis.hide = () => {
		const style = document.documentElement.style;
		if (!saved) saved = [style.getPropertyValue("opacity"), style.getPropertyPriority("opacity")];
		style.setProperty("opacity", "0", "important");
	};
	globalThis.show = () => {
		if (!saved) return;
		const style = document.documentElement.style;
		const [value, priority] = saved;
		saved = null;
		if (value) style.setProperty("opacity", value, priority);
		else style.removeProperty("opacity");
	};
	let frameSeen = false;
	globalThis.watchFrame = () => {
		frameSeen = false;
		requestAnimationFrame(() => {
			frameSeen = true;
		});
	};
	globalThis.frameSeen = () => frameSeen;
	globalThis.hideForOneFrame = async () => {
		hide();
		try {
			await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
		} finally {
			show();
		}
	};
})()`;

/** BeginFrames a BeginFrame capture draws at most while waiting for the page to be on screen. */
const SETTLE_ATTEMPTS = 20;

/** Extra time the Node watchdog gives a seek beyond the readiness timeout. */
export const WATCHDOG_GRACE_MS = 5_000;

const PAGE_CODES = new Set<MotioErrorCode>([
	"E_READINESS_TIMEOUT",
	"E_CANCELLED",
	"E_COMPOSITION_NOT_FOUND",
	"E_CALCULATE_METADATA",
	"E_INVALID_COMPOSITION",
	"E_RENDER_ERROR",
	"E_ASSET_NOT_FOUND",
	"E_FONT_LOAD",
]);

/** A page error that crossed the boundary, with the optional retry budget of the handle. */
interface SerializedPageError extends Partial<PageError> {
	retries?: number;
}

type CallResult<T> = { ok: true; value: T } | { ok: false; error: SerializedPageError };

/** Calls a page API method and returns a structured result instead of rejecting. */
const CALL = `(async (global, method, args) => {
	const api = window[global];
	try {
		return { ok: true, value: await api[method](...args) };
	} catch (e) {
		if (e && typeof e === "object") {
			return { ok: false, error: { code: e.code, message: String(e.message ?? e), label: e.label, frame: e.frame, stack: e.stack, retries: e.retries, timeoutMs: e.timeoutMs, details: e.details } };
		}
		return { ok: false, error: { message: String(e) } };
	}
})`;

const LOG_TYPES: Record<string, BrowserLogType> = { warn: "warning" };

/** Converts a page error to a `MotioError`; `retries` is kept for the pool. */
export function fromPageError(
	e: SerializedPageError,
	fallbackFrame: number | undefined,
	composition: string | undefined,
): MotioError & { retries?: number } {
	const code: MotioErrorCode =
		e.code && PAGE_CODES.has(e.code as MotioErrorCode)
			? (e.code as MotioErrorCode)
			: "E_RENDER_ERROR";
	const frame = e.frame ?? fallbackFrame;
	let message = e.message ?? "Unknown error in the page";
	// The page runtime names the frame in its timeout messages; a page that does not (an older
	// bundle, a hand-written page) gets it appended once.
	if (
		code === "E_READINESS_TIMEOUT" &&
		frame !== undefined &&
		!message.includes(`frame ${frame}`)
	) {
		message = `${message} (frame ${frame})`;
	}
	const ctx: Record<string, unknown> = {};
	if (frame !== undefined) ctx.frame = frame;
	if (e.label !== undefined) ctx.label = e.label;
	if (composition !== undefined) ctx.composition = composition;
	if (e.stack !== undefined) ctx.pageStack = e.stack;
	const details: Record<string, unknown> = { ...e.details };
	if (code === "E_READINESS_TIMEOUT") {
		if (e.label !== undefined) details.label = e.label;
		if (e.timeoutMs !== undefined) details.timeoutMs = e.timeoutMs;
		details.option = "timeoutInMilliseconds";
	}
	if (Object.keys(details).length > 0) ctx.details = details;
	const err = new MotioError(code, message, ctx) as MotioError & { retries?: number };
	if (typeof e.retries === "number") err.retries = e.retries;
	return err;
}

/**
 * The error with its page stack mapped to the project's sources: `pageStack` becomes the mapped
 * stack, `details.source` the first frame in the project's code and `details.rawStack` the stack
 * as the page reported it. Errors without a stack, or whose stack maps to nothing, are returned
 * as they are.
 */
export async function mapErrorStack<E extends MotioError>(
	err: E,
	mapper: StackMapper | undefined,
): Promise<E> {
	if (!mapper || err.pageStack === undefined) return err;
	let mapped: Awaited<ReturnType<StackMapper["map"]>>;
	try {
		mapped = await mapper.map(err.pageStack);
	} catch (mapError) {
		// A broken or unreadable source map must not hide the error itself: it is reported with
		// the raw stack and the reason the mapping failed.
		return withRetries(
			err.withContext({
				details: {
					...err.details,
					sourceMapError: mapError instanceof Error ? mapError.message : String(mapError),
				},
			}) as E,
			err,
		);
	}
	if (mapped.stack === err.pageStack && !mapped.source) return err;
	const details: Record<string, unknown> = { ...err.details, rawStack: err.pageStack };
	if (mapped.source) details.source = mapped.source;
	return withRetries(err.withContext({ pageStack: mapped.stack, details }) as E, err);
}

/** Copies the pool's retry budget, which `withContext` does not know about. */
function withRetries<E extends MotioError>(out: E, from: MotioError): E {
	const retries = (from as { retries?: number }).retries;
	if (retries !== undefined) (out as { retries?: number }).retries = retries;
	return out;
}

/**
 * Pages whose browsers have this key can share one. The window size is left out for screenshot
 * pages, which set their own viewport, so renders of different sizes share a browser opened by
 * `openBrowser()`; BeginFrame captures depend on the window and keep it.
 */
export function browserPoolKey(launch: LaunchOptions): string {
	const args = launchArgs(launch);
	return JSON.stringify([
		launch.executablePath,
		launch.beginFrame ? args : args.filter((a) => !a.startsWith("--window-size=")),
	]);
}

/** How long closing a page on a shared browser may take before the browser is killed. */
const PAGE_CLOSE_TIMEOUT_MS = 3_000;

/**
 * One page on the bundle, on its own browser process or on one shared with other pages of the
 * session (D-042). Injects the run context, checks the protocol version and wraps the page API
 * with a Node-side watchdog and crash detection.
 */
export class RenderPage {
	private failure: MotioError | undefined;
	private readonly waiters = new Set<(err: MotioError) => void>();
	private closed = false;
	private closing: Promise<void> | undefined;
	private composition: string | undefined;
	/** Frame of the page call in flight, stamped on errors that interrupt it. */
	private inFlightFrame: number | undefined;
	/** The last BeginFrame sent; BeginFrames are serialised. */
	private frameChain: Promise<unknown> = Promise.resolve();
	/** Images, fonts and style sheets being loaded, by request id. */
	private readonly loading = new Set<string>();
	/** Such requests started so far. */
	private requestsStarted = 0;
	private readonly loadingWaiters = new Set<() => void>();
	/** Execution context of the isolated world that resets the raster state before each capture. */
	private isolatedWorld: number | undefined;
	/** The last frame the page rendered or stepped through in the virtual time model; -1 before. */
	private virtualFrame = -1;

	private readonly onDisconnected = () => {
		if (!this.closed) {
			this.fail(
				new MotioError(
					"E_BROWSER_CRASHED",
					"The browser process exited unexpectedly",
					this.failureContext(),
				),
			);
		}
	};

	private constructor(
		private readonly browser: Browser,
		private readonly page: Page,
		private readonly cdp: CDPSession,
		private readonly config: PageConfig,
		private readonly lease: BrowserLease | undefined,
	) {}

	/**
	 * Opens a page on a pooled browser (or launches its own), loads the bundle and completes the
	 * protocol handshake. A pooled browser can die between two pages before its disconnection is
	 * observed (the process exits, the CDP connection closes a moment later), so the pool hands it
	 * out and opening the tab fails with "Target closed": the page is then opened once more on a
	 * new browser, and a browser that dies again fails with `E_BROWSER_CRASHED`.
	 */
	static async open(config: PageConfig): Promise<RenderPage> {
		try {
			return await RenderPage.openOnce(config);
		} catch (err) {
			if (!(err instanceof BrowserGoneError)) throw err;
			if (config.browsers) {
				try {
					return await RenderPage.openOnce(config);
				} catch (again) {
					if (!(again instanceof BrowserGoneError)) throw again;
					throw again.crash;
				}
			}
			throw err.crash;
		}
	}

	private static async openOnce(config: PageConfig): Promise<RenderPage> {
		const launch: LaunchOptions = {
			executablePath: config.executablePath,
			chromiumOptions: config.chromiumOptions,
			width: Math.round(config.width * config.scale),
			height: Math.round(config.height * config.scale),
			transparent: config.transparent,
			...(config.captureMethod === "begin-frame" ? { beginFrame: { scale: config.scale } } : {}),
		};
		const shared = config.browsers;
		const lease = shared
			? await shared.pool.lease(browserPoolKey(launch), shared.pagesPerBrowser, () =>
					launchBrowser(launch),
				)
			: undefined;
		const browser = lease ? lease.browser : await launchBrowser(launch);
		let rp: RenderPage | undefined;
		let page: Page | undefined;
		try {
			page = await openTab(browser, lease, config.captureMethod === "begin-frame");
			const cdp = await page.createCDPSession();
			rp = new RenderPage(browser, page, cdp, config, lease);
			rp.attachListeners();
			await rp.prepare();
			return rp;
		} catch (err) {
			const gone = !browserAlive(browser);
			if (rp) await rp.close();
			else if (lease) {
				await closeTab(page, lease);
			} else await killBrowser(browser);
			if (gone) {
				// Taken out of the pool now, whether or not its disconnection was delivered yet.
				if (lease) await lease.kill();
				throw new BrowserGoneError(
					new MotioError(
						"E_BROWSER_CRASHED",
						`The browser process exited while a page was opening: ${err instanceof Error ? err.message : String(err)}`,
						{},
						err,
					),
				);
			}
			throw err;
		}
	}

	/** The capture path of this page. */
	get captureMethod(): CaptureMethod {
		return this.config.captureMethod ?? "screenshot";
	}

	/** The time model of this page. */
	get timeModel(): TimeModel {
		return this.config.timeModel ?? "frame";
	}

	/**
	 * Whether `frame` needs a new page: in the virtual time model a page renders ascending frames
	 * only, because its clock cannot go back (ARCHITECTURE, "Time").
	 */
	needsNewPageFor(frame: number): boolean {
		return this.timeModel === "virtual" && frame <= this.virtualFrame;
	}

	/** Process id of the browser, for diagnostics. */
	get pid(): number | undefined {
		return this.browser.process()?.pid;
	}

	private attachListeners(): void {
		const log = this.config.onBrowserLog;
		this.page.on("console", (msg) => {
			log?.({
				text: msg.text(),
				type: LOG_TYPES[msg.type()] ?? (msg.type() as BrowserLogType),
				stackTrace: msg.stackTrace().map((l) => {
					const out: { url?: string; lineNumber?: number; columnNumber?: number } = {};
					if (l.url !== undefined) out.url = l.url;
					if (l.lineNumber !== undefined) out.lineNumber = l.lineNumber;
					if (l.columnNumber !== undefined) out.columnNumber = l.columnNumber;
					return out;
				}),
			});
		});
		this.page.on("pageerror", (err) => {
			const message = err instanceof Error ? err.message : String(err);
			const stack = err instanceof Error ? err.stack : undefined;
			log?.({ text: stack ?? message, type: "error", stackTrace: [] });
			const frame = this.inFlightFrame;
			const ctx = this.failureContext();
			if (stack !== undefined) ctx.pageStack = stack;
			const uncaught = new MotioError(
				"E_PAGE_ERROR",
				`Uncaught error in the page${frame === undefined ? "" : ` at frame ${frame}`}: ${message}. Fix the error in the composition code.`,
				ctx,
			);
			// cancelRender() throws; called from a timer or a promise callback, its error arrives
			// here too. That error is the cancellation itself, which the page reports with its own
			// code on the call in flight or the next one (a font that failed at module level must
			// not fail the listing of compositions). Any other uncaught error fails the page.
			void this.cancellation().then(
				async (cancelled) => {
					// Chrome may prefix the message (the error's name, "Uncaught (in promise)").
					if (cancelled?.message && message.includes(cancelled.message)) return;
					const error = cancelled ? fromPageError(cancelled, frame, this.composition) : uncaught;
					this.fail(await mapErrorStack(error, this.config.stackMapper));
				},
				() => this.fail(uncaught),
			);
		});
		this.page.on("error", (err) => {
			this.fail(
				new MotioError(
					"E_BROWSER_CRASHED",
					`The page crashed: ${err.message}`,
					this.failureContext(),
					err,
				),
			);
		});
		this.browser.on("disconnected", this.onDisconnected);
	}

	/** Composition and the frame being sought, for errors raised outside a page call. */
	private failureContext(): Record<string, unknown> {
		const ctx: Record<string, unknown> = {};
		if (this.inFlightFrame !== undefined) ctx.frame = this.inFlightFrame;
		if (this.composition !== undefined) ctx.composition = this.composition;
		return ctx;
	}

	/** The page's `cancelRender()` error, if any (absent in bundles without `cancelled()`). */
	private async cancellation(): Promise<SerializedPageError | null> {
		const expr = `(() => { const api = window[${JSON.stringify(PAGE_API_GLOBAL)}]; return api && typeof api.cancelled === "function" ? api.cancelled() : null; })()`;
		return (await this.page.evaluate(expr)) as SerializedPageError | null;
	}

	private fail(err: MotioError): void {
		if (this.failure) return;
		this.failure = err;
		for (const w of this.waiters) w(err);
		this.waiters.clear();
	}

	/**
	 * Runs `work`, rejecting early if the page fails (crash, uncaught error) or the watchdog
	 * fires after `timeoutMs`.
	 */
	private guard<T>(
		work: Promise<T>,
		timeoutMs: number,
		onTimeout: () => MotioError,
		pump = true,
	): Promise<T> {
		if (this.failure) return Promise.reject(this.failure);
		if (pump && this.captureMethod === "begin-frame") work = this.pumpWhile(work);
		return new Promise<T>((resolve, reject) => {
			let settled = false;
			const done = (fn: () => void) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				this.waiters.delete(onFail);
				fn();
			};
			const onFail = (err: MotioError) => done(() => reject(err));
			const timer = setTimeout(() => done(() => reject(onTimeout())), timeoutMs);
			this.waiters.add(onFail);
			work.then(
				(v) => done(() => resolve(v)),
				(err: unknown) =>
					done(() =>
						reject(
							this.failure ??
								(err instanceof MotioError
									? err
									: new MotioError(
											"E_BROWSER_CRASHED",
											`Lost the connection to the page: ${err instanceof Error ? err.message : String(err)}`,
											{},
											err,
										)),
						),
					),
			);
		});
	}

	/**
	 * Sends a BeginFrame after any BeginFrame still in flight: Chrome handles one at a time.
	 * Rejections propagate to the caller only; the chain itself never rejects.
	 */
	private beginFrame(params: {
		interval: number;
		noDisplayUpdates?: boolean;
		screenshot?: { format: "jpeg" | "png" | "webp"; quality?: number; optimizeForSpeed?: boolean };
	}): Promise<{ hasDamage: boolean; screenshotData?: string }> {
		const next = this.frameChain.then(() =>
			this.cdp.send("HeadlessExperimental.beginFrame", params),
		);
		this.frameChain = next.catch(() => undefined);
		return next;
	}

	/**
	 * Keeps the compositor ticking until `work` settles, so `requestAnimationFrame` callbacks run
	 * on a BeginFrame page; work that finishes within one interval sends no frame. Resolves after
	 * the last frame sent, so a capture never overlaps it.
	 */
	private async pumpWhile<T>(work: Promise<T>): Promise<T> {
		let settled = false;
		let timer: NodeJS.Timeout | undefined;
		const tick = () => {
			timer = setTimeout(() => {
				if (settled || this.closed) return;
				void this.beginFrame({ interval: BEGIN_FRAME_PUMP_MS, noDisplayUpdates: true })
					.catch(() => undefined)
					.then(() => {
						if (!settled) tick();
					});
			}, BEGIN_FRAME_PUMP_MS);
		};
		tick();
		try {
			return await work;
		} finally {
			settled = true;
			clearTimeout(timer);
			await this.frameChain;
		}
	}

	/**
	 * A CSS background image or a font is requested only when style and layout run, which can be
	 * after the page reported the frame ready; under BeginFrame control they run only inside a
	 * frame. The page tracks those requests to wait for them before the frame it captures.
	 */
	private async trackResources(): Promise<void> {
		const done = (e: { requestId: string }) => {
			if (!this.loading.delete(e.requestId)) return;
			if (this.loading.size === 0) {
				for (const w of this.loadingWaiters) w();
				this.loadingWaiters.clear();
			}
		};
		this.cdp.on("Network.requestWillBeSent", (e) => {
			if (e.type !== undefined && !TRACKED_RESOURCES.has(e.type)) return;
			if (e.request.url.startsWith("data:")) return;
			if (!this.loading.has(e.requestId)) this.requestsStarted++;
			this.loading.add(e.requestId);
		});
		this.cdp.on("Network.loadingFinished", done);
		this.cdp.on("Network.loadingFailed", done);
		await this.cdp.send("Network.enable");
	}

	/** Resolves when no tracked resource is loading. */
	private resourcesLoaded(): Promise<void> {
		if (this.loading.size === 0) return Promise.resolve();
		return new Promise((resolve) => this.loadingWaiters.add(resolve));
	}

	/**
	 * Runs style and layout with `layout` and waits for the images, fonts and style sheets they
	 * requested, until a pass requests nothing. Each pass ends with a round trip through the page's
	 * main thread, which delivers the request events sent during the pass before its result;
	 * `layoutIsRoundTrip` says `layout` already is one (an evaluation in the page).
	 */
	private async awaitResources(
		layout: () => Promise<unknown>,
		layoutIsRoundTrip = false,
	): Promise<void> {
		for (let pass = 0; pass < BEGIN_FRAME_ATTEMPTS; pass++) {
			const started = this.requestsStarted;
			await layout();
			if (!layoutIsRoundTrip) await this.cdp.send("Runtime.evaluate", { expression: "0" });
			await this.resourcesLoaded();
			if (this.requestsStarted === started) return;
		}
	}

	private async prepare(): Promise<void> {
		const c = this.config;
		await this.trackResources();
		const context: RunContext = {
			protocol: PROTOCOL_VERSION,
			inputProps: c.inputProps,
			env: c.envVariables,
			timeModel: this.timeModel,
			readinessTimeoutMs: c.timeoutInMilliseconds,
			isRendering: true,
		};
		if (c.mediaBaseUrl !== undefined) context.mediaBaseUrl = c.mediaBaseUrl;
		// Page.addScriptToEvaluateOnNewDocument on the page's main session, so it runs before any
		// page script on every navigation.
		await this.page.evaluateOnNewDocument(
			`Object.defineProperty(window, ${JSON.stringify(RUN_CONTEXT_GLOBAL)}, { value: Object.freeze(${JSON.stringify(context)}), writable: false, configurable: false });`,
		);
		if (this.timeModel === "virtual") {
			// After the run context, which the shim reads for the random seed. Only in the top frame:
			// nothing advances the clock of an iframe, whose timers would never fire.
			await this.page.evaluateOnNewDocument(`if (window === window.top) ${CLOCK_SHIM_SCRIPT}`);
		}
		// Set on the session that captures: emulation overrides are per CDP session, and a
		// device scale factor set elsewhere would not reach Page.captureScreenshot.
		await this.cdp.send("Emulation.setDeviceMetricsOverride", {
			width: c.width,
			height: c.height,
			deviceScaleFactor: c.scale,
			mobile: false,
		});
		// Where the composition draws nothing, a transparent capture stays transparent and an opaque
		// one (JPEG, the video default) is black, as in Remotion's output; Chrome's own default
		// background is white (D-050).
		await this.cdp.send("Emulation.setDefaultBackgroundColorOverride", {
			color: { r: 0, g: 0, b: 0, a: c.transparent ? 0 : 1 },
		});
		if (c.chromiumOptions.darkMode) {
			await this.page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
		}
		if (c.chromiumOptions.userAgent)
			await this.page.setUserAgent({ userAgent: c.chromiumOptions.userAgent });
		const timeout = c.timeoutInMilliseconds + WATCHDOG_GRACE_MS;
		await this.guard(
			this.page.goto(c.serveUrl, { waitUntil: "load", timeout: 0 }).then((res) => {
				if (res && !res.ok()) {
					throw new MotioError(
						"E_SERVE_URL",
						`Loading ${c.serveUrl} returned HTTP ${res.status()}. Check that serveUrl points at a built bundle.`,
					);
				}
			}),
			timeout,
			() =>
				new MotioError(
					"E_SEEK_TIMEOUT",
					`The bundle at ${c.serveUrl} did not finish loading within ${timeout} ms.`,
				),
		);
		const protocol = await this.guard(
			this.page
				.waitForFunction(`window[${JSON.stringify(PAGE_API_GLOBAL)}] !== undefined`, {
					timeout: 0,
					polling: 20,
				})
				.then(() => this.page.evaluate(`window[${JSON.stringify(PAGE_API_GLOBAL)}].protocol`)),
			timeout,
			() =>
				new MotioError(
					"E_PAGE_API_MISSING",
					`The page at ${c.serveUrl} did not install window.${PAGE_API_GLOBAL} within ${timeout} ms. Is this a Motio bundle, and does its entry call registerRoot()?`,
				),
		);
		if (protocol !== PROTOCOL_VERSION) {
			throw new MotioError(
				"E_PROTOCOL_MISMATCH",
				`The bundle speaks frame protocol ${JSON.stringify(protocol)}, but this renderer speaks protocol ${PROTOCOL_VERSION}. Rebuild the bundle with the @motiojs/core version that matches @motiojs/renderer.`,
				{ details: { bundleProtocol: protocol, rendererProtocol: PROTOCOL_VERSION } },
			);
		}
		if (this.timeModel === "virtual") {
			const models = await this.page.evaluate(
				`(() => { const m = window[${JSON.stringify(PAGE_API_GLOBAL)}].timeModels; return Array.isArray(m) ? m : null; })()`,
			);
			if (!(models as string[] | null)?.includes("virtual")) {
				throw new MotioError(
					"E_PROTOCOL_MISMATCH",
					"The bundle was built with a @motiojs/core that does not implement the virtual time model. Rebuild the bundle with the @motiojs/core version that matches @motiojs/renderer.",
					{ details: { option: "timeModel" } },
				);
			}
		}
		const { frameTree } = await this.cdp.send("Page.getFrameTree");
		const world = await this.cdp.send("Page.createIsolatedWorld", {
			frameId: frameTree.frame.id,
			worldName: "motio-raster-reset",
		});
		this.isolatedWorld = world.executionContextId;
		await this.evaluateIsolated(RASTER_RESET_WORLD);
	}

	/** Evaluates `expression` in the isolated world, awaits its promise and returns its value. */
	private async evaluateIsolated(expression: string): Promise<unknown> {
		const contextId = this.isolatedWorld;
		if (contextId === undefined) {
			throw new MotioError("E_RENDER_ERROR", "The page was used before it finished loading.");
		}
		const res = await this.cdp.send("Runtime.evaluate", {
			expression,
			awaitPromise: true,
			returnByValue: true,
			contextId,
		});
		if (res.exceptionDetails) {
			throw new MotioError(
				"E_RENDER_ERROR",
				`Resetting the page before a frame failed: ${res.exceptionDetails.exception?.description ?? res.exceptionDetails.text}`,
			);
		}
		return res.result.value;
	}

	/**
	 * Makes the frame about to be captured rasterise as on a fresh page, whatever the page rendered
	 * before (ARCHITECTURE, "Raster reset"): the document, already showing the frame, is hidden
	 * for one painted frame. BeginFrame pages draw that frame in `captureBeginFrame`.
	 */
	private async resetRaster(): Promise<void> {
		await this.evaluateIsolated("hideForOneFrame()");
	}

	private async call<T>(
		method: keyof import("@motiojs/core/protocol").PageApi,
		args: unknown[],
		timeoutMs: number,
		onTimeout: () => MotioError,
		frame?: number,
	): Promise<T> {
		const expr = `${CALL}(${JSON.stringify(PAGE_API_GLOBAL)}, ${JSON.stringify(method)}, ${JSON.stringify(args)})`;
		this.inFlightFrame = frame;
		const stopReporting = this.reportPending(frame);
		let result: CallResult<T>;
		try {
			result = await this.guard(
				this.page.evaluate(expr) as Promise<CallResult<T>>,
				timeoutMs,
				onTimeout,
			);
		} finally {
			stopReporting();
			this.inFlightFrame = undefined;
		}
		if (!result.ok) {
			throw await mapErrorStack(
				fromPageError(result.error, frame, this.composition),
				this.config.stackMapper,
			);
		}
		return result.value;
	}

	/**
	 * While a page call runs, asks the page every `pendingReportMs` which `delayRender()` handles
	 * are open and passes each to `onDelayRenderPending`. Returns the function that stops it.
	 * Bundles without `PageApi.pending()` report nothing.
	 */
	private reportPending(frame: number | undefined): () => void {
		const report = this.config.onDelayRenderPending;
		if (!report) return () => {};
		const expr = `(() => { const api = window[${JSON.stringify(PAGE_API_GLOBAL)}]; return api && typeof api.pending === "function" ? api.pending() : []; })()`;
		let stopped = false;
		let busy = false;
		const tick = async () => {
			if (stopped || busy || this.closed) return;
			busy = true;
			try {
				const handles = (await this.page.evaluate(expr)) as PendingHandle[];
				if (stopped) return;
				for (const h of handles) {
					report({
						label: h.label,
						frame: frame ?? null,
						compositionId: this.composition ?? null,
						elapsedMs: h.elapsedMs,
						timeoutMs: h.timeoutMs,
					});
				}
			} catch (err) {
				// The page closed or crashed while it was asked: the call in flight reports that
				// failure; the progress report just stops.
				if (!this.closed && !this.failure)
					this.config.onBrowserLog?.({
						text: `Could not read the pending delayRender() handles: ${err instanceof Error ? err.message : String(err)}`,
						type: "warning",
						stackTrace: [],
					});
				stopped = true;
			} finally {
				busy = false;
			}
		};
		const timer = setInterval(() => void tick(), this.config.pendingReportMs ?? PENDING_REPORT_MS);
		timer.unref();
		return () => {
			stopped = true;
			clearInterval(timer);
		};
	}

	/** The compositions the bundle registers, before `calculateMetadata`. */
	getCompositions(): Promise<CompositionInfo[]> {
		const timeout = this.config.timeoutInMilliseconds + WATCHDOG_GRACE_MS;
		return this.call<CompositionInfo[]>(
			"getCompositions",
			[],
			timeout,
			() =>
				new MotioError("E_SEEK_TIMEOUT", `getCompositions() did not return within ${timeout} ms.`),
		);
	}

	/**
	 * Selects a composition. With input `props` the page runs `calculateMetadata`; with
	 * `options.resolved` it uses that metadata as is, as Remotion's `renderMedia` and
	 * `renderStill` render the composition object they are given.
	 */
	async setComposition(
		id: string,
		props: Record<string, unknown>,
		options?: SetCompositionOptions,
	): Promise<ResolvedComposition> {
		this.composition = id;
		const timeout = this.config.timeoutInMilliseconds + WATCHDOG_GRACE_MS;
		return this.call<ResolvedComposition>(
			"setComposition",
			options ? [id, props, options] : [id, props],
			timeout,
			() =>
				new MotioError(
					"E_SEEK_TIMEOUT",
					`Selecting composition "${id}" did not finish within ${timeout} ms. Check calculateMetadata().`,
					{ composition: id },
				),
		);
	}

	/**
	 * Seeks to `frame` and resolves when the page is ready to capture. The watchdog fires
	 * `WATCHDOG_GRACE_MS` after the readiness timeout, so the page reports its own readiness
	 * timeout (with the label) first; a busy loop in user code still cannot hang the render.
	 */
	async seek(frame: number): Promise<FrameReport> {
		const timeout = this.config.timeoutInMilliseconds + WATCHDOG_GRACE_MS;
		const ctx: Record<string, unknown> = { frame };
		if (this.composition !== undefined) ctx.composition = this.composition;
		if (this.timeModel === "virtual") {
			if (this.needsNewPageFor(frame)) {
				throw new MotioError(
					"E_RENDER_ERROR",
					`In the virtual time model a page renders ascending frames, but frame ${frame} was asked after frame ${this.virtualFrame}. This is a bug in the renderer; please report it.`,
					ctx,
				);
			}
			// The page steps through every frame before this one (ARCHITECTURE, "Time"), a bounded
			// number per call, so the watchdog of each call measures a few frames, not the history.
			while (frame - 1 - this.virtualFrame > VIRTUAL_STEPS_PER_CALL) {
				const to = this.virtualFrame + VIRTUAL_STEPS_PER_CALL;
				await this.call<void>(
					"advance",
					[to],
					timeout,
					() =>
						new MotioError(
							"E_SEEK_TIMEOUT",
							`Stepping the virtual clock to frame ${to}, before frame ${frame}, took longer than ${timeout} ms and the page stopped responding. Look for a long-running loop in the composition, or raise the timeout (timeoutInMilliseconds in the Node API, --timeout on the command line).`,
							{ ...ctx, details: { option: "timeoutInMilliseconds", timeoutMs: timeout } },
						),
					to,
				);
				this.virtualFrame = to;
			}
			// Set before the call: a failed seek leaves the clock somewhere up to the frame, and the
			// pool replaces the page anyway.
			this.virtualFrame = frame;
		}
		const report = await this.call<FrameReport>(
			"seek",
			[frame],
			timeout,
			() =>
				new MotioError(
					"E_SEEK_TIMEOUT",
					`Frame ${frame} did not become ready within ${timeout} ms and the page stopped responding. Look for a long-running loop in the composition, or raise the timeout (timeoutInMilliseconds in the Node API, --timeout on the command line).`,
					{ ...ctx, details: { option: "timeoutInMilliseconds", timeoutMs: timeout } },
				),
			frame,
		);
		if (report.warnings.length > 0) this.config.onWarnings?.(report.warnings, frame);
		if (report.frame !== frame) {
			throw new MotioError(
				"E_FRAME_MISMATCH",
				`Requested frame ${frame} but the page rendered frame ${report.frame}. This is a bug in the page runtime; please report it.`,
				ctx,
			);
		}
		return report;
	}

	/** Captures the viewport as JPEG, PNG or WebP. */
	async capture(format: "jpeg" | "png" | "webp", quality: number, frame: number): Promise<Buffer> {
		const timeout = this.config.timeoutInMilliseconds + WATCHDOG_GRACE_MS;
		if (this.captureMethod === "begin-frame") {
			return this.guardCapture(this.captureBeginFrame(format, quality, frame), timeout, frame);
		}
		// A resource the frame's style requests (a CSS background image, a font) can still be
		// loading when the page reports the frame ready, and a fast capture would miss it: reading
		// the layout runs style and layout, which starts those requests, and they are awaited.
		const capture = this.resetRaster()
			.then(() =>
				this.awaitResources(
					() =>
						this.cdp.send("Runtime.evaluate", {
							expression: "void document.documentElement.getBoundingClientRect()",
						}),
					true,
				),
			)
			.then(() =>
				this.cdp.send("Page.captureScreenshot", {
					format,
					...(format === "png" ? {} : { quality }),
					optimizeForSpeed: true,
					fromSurface: true,
					captureBeyondViewport: false,
				}),
			);
		const res = await this.guard(
			capture,
			timeout,
			() =>
				new MotioError(
					"E_CAPTURE_FAILED",
					`Capturing frame ${frame} took longer than ${timeout} ms.`,
					{
						frame,
					},
				),
		);
		return Buffer.from(res.data, "base64");
	}

	/** Like `guard`, without pumping frames: the capture sends its own. */
	private guardCapture(work: Promise<Buffer>, timeout: number, frame: number): Promise<Buffer> {
		return this.guard(
			work,
			timeout,
			() =>
				new MotioError(
					"E_CAPTURE_FAILED",
					`Capturing frame ${frame} took longer than ${timeout} ms.`,
					{
						frame,
					},
				),
			false,
		);
	}

	/**
	 * Draws one frame with BeginFrame and returns its screenshot. The first frames after a
	 * navigation can come without a screenshot while the compositor initialises, so a few
	 * attempts are made before failing with `E_CAPTURE_FAILED`.
	 */
	private async captureBeginFrame(
		format: "jpeg" | "png" | "webp",
		quality: number,
		frame: number,
	): Promise<Buffer> {
		// One main frame runs with the document hidden, so the captured frame is rasterised as on a
		// fresh page (ARCHITECTURE, "Raster reset"); a frame without display updates does not
		// paint, and Blink compares the captured frame with the last paint. The animation frame
		// watched in the isolated world proves that main frame ran: a renderer that missed a
		// BeginFrame runs it on the next one.
		await this.evaluateIsolated("hide(); watchFrame()");
		try {
			for (let i = 0; i < BEGIN_FRAME_ATTEMPTS; i++) {
				await this.beginFrame({ interval: BEGIN_FRAME_PUMP_MS });
				if (await this.isolatedFrameSeen()) break;
			}
		} finally {
			await this.evaluateIsolated("show()");
		}
		// Frames without display updates run style and layout, which starts the requests for
		// resources the frame needs (CSS images, fonts).
		await this.awaitResources(() =>
			this.beginFrame({ interval: BEGIN_FRAME_PUMP_MS, noDisplayUpdates: true }),
		);
		await this.settleBeginFrame();
		const screenshot = { format, ...(format === "png" ? {} : { quality }), optimizeForSpeed: true };
		for (let attempt = 0; attempt < BEGIN_FRAME_ATTEMPTS; attempt++) {
			const res = await this.beginFrame({ interval: BEGIN_FRAME_PUMP_MS, screenshot });
			if (res.screenshotData) return Buffer.from(res.screenshotData, "base64");
		}
		throw new MotioError(
			"E_CAPTURE_FAILED",
			`No BeginFrame returned a screenshot of frame ${frame} in ${BEGIN_FRAME_ATTEMPTS} attempts. Retry with captureMethod "screenshot".`,
			{ frame },
		);
	}

	/**
	 * Draws frames until the shown document is on screen. The display compositor draws a
	 * BeginFrame without waiting for the page's renderer when the renderer did not receive that
	 * BeginFrame in time (it was not observing BeginFrames yet, or was throttled) or still has an
	 * undrawn frame: the renderer's frame then lands one BeginFrame late, and stays late on every
	 * following frame, so the screenshot would show the hidden document or an earlier frame. This
	 * happened on loaded machines (several pages, one browser each). Frames are drawn until a main
	 * frame ran after `show()` (the watched animation frame, which commits it) and a later
	 * BeginFrame finds nothing new to draw: every frame the renderer produced is on screen and the
	 * renderer is no longer behind. A page that changes on every frame (a loop on
	 * `requestAnimationFrame`) never settles and is captured after the last attempt, as before.
	 */
	private async settleBeginFrame(): Promise<void> {
		await this.evaluateIsolated("watchFrame()");
		let committed = false;
		for (let i = 0; i < SETTLE_ATTEMPTS; i++) {
			const res = await this.beginFrame({ interval: BEGIN_FRAME_PUMP_MS });
			if (committed && !res.hasDamage) return;
			committed ||= await this.isolatedFrameSeen();
		}
	}

	/** Whether an animation frame ran since the last `watchFrame()` in the isolated world. */
	private async isolatedFrameSeen(): Promise<boolean> {
		return (await this.evaluateIsolated("frameSeen()")) === true;
	}

	/**
	 * Closes the page: on a shared browser the tab is closed (the browser is killed if that takes
	 * longer than 3 s) and the slot given back; on its own browser the process is killed. Safe to
	 * call more than once: every call resolves when the close is complete, so a caller awaiting it
	 * never races a close another caller started (a cancelled render used to return while its
	 * browsers were still exiting). Pooled browsers exit when the session closes its pool.
	 */
	close(): Promise<void> {
		if (!this.closing) {
			this.closed = true;
			this.browser.off("disconnected", this.onDisconnected);
			this.closing = this.lease ? closeTab(this.page, this.lease) : killBrowser(this.browser);
		}
		return this.closing;
	}
}

/** A page could not open because its browser process is gone; `crash` is the error to report. */
class BrowserGoneError extends Error {
	constructor(readonly crash: MotioError) {
		super(crash.message);
	}
}

/** Whether the browser is still connected and its process (when known) has not exited. */
function browserAlive(browser: Browser): boolean {
	const proc = browser.process();
	return browser.connected && (!proc || (proc.exitCode === null && proc.signalCode === null));
}

/**
 * A tab for a new page: the tab a fresh browser opened at launch, else a new one. Under BeginFrame
 * control a new tab must be created with BeginFrame control itself (D-013), which only
 * `Target.createTarget` offers; it is found again by a unique URL.
 */
async function openTab(
	browser: Browser,
	lease: BrowserLease | undefined,
	beginFrame: boolean,
): Promise<Page> {
	if (!lease || lease.takeInitialTab()) {
		const [first] = await browser.pages();
		if (first) return first;
	}
	if (!beginFrame) return browser.newPage();
	const url = `about:blank#motio-${randomUUID()}`;
	const session = await browser.target().createCDPSession();
	try {
		await session.send("Target.createTarget", { url, enableBeginFrameControl: true });
	} finally {
		await session.detach().catch(() => undefined);
	}
	const target = await browser.waitForTarget((t) => t.url() === url, { timeout: 30_000 });
	const page = await target.page();
	if (!page) throw new MotioError("E_BROWSER_CRASHED", "The browser did not open a new tab");
	return page;
}

/** Closes a tab on a shared browser and gives its slot back; kills the browser if the tab hangs. */
async function closeTab(page: Page | undefined, lease: BrowserLease): Promise<void> {
	try {
		if (!page || !lease.browser.connected) return;
		// A tab that is already gone rejects, which needs nothing more; a tab whose renderer does
		// not respond would hold the slot, so its browser is killed.
		const outcome = await Promise.race([
			page.close().then(
				() => "closed" as const,
				() => "gone" as const,
			),
			new Promise<"timeout">((ok) =>
				setTimeout(() => ok("timeout"), PAGE_CLOSE_TIMEOUT_MS).unref(),
			),
		]);
		if (outcome === "timeout" && lease.browser.connected) await lease.kill();
	} finally {
		lease.release();
	}
}
