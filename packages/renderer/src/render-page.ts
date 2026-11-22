import {
	type CompositionInfo,
	type FrameReport,
	PAGE_API_GLOBAL,
	type PageError,
	PROTOCOL_VERSION,
	type ResolvedComposition,
	RUN_CONTEXT_GLOBAL,
	type RunContext,
	type SetCompositionOptions,
} from "@motiojs/core/protocol";
import type { Browser, CDPSession, Page } from "puppeteer-core";
import type { ChromiumOptions } from "./browser/flags.js";
import { launchBrowser } from "./browser/launch.js";
import type { BrowserLog, BrowserLogType } from "./browser-log.js";
import { MotioError, type MotioErrorCode } from "./errors.js";

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
}

/** Extra time the Node watchdog gives a seek beyond the readiness timeout. */
export const WATCHDOG_GRACE_MS = 5_000;

const PAGE_CODES = new Set<MotioErrorCode>([
	"E_READINESS_TIMEOUT",
	"E_CANCELLED",
	"E_COMPOSITION_NOT_FOUND",
	"E_CALCULATE_METADATA",
	"E_INVALID_COMPOSITION",
	"E_RENDER_ERROR",
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
			return { ok: false, error: { code: e.code, message: String(e.message ?? e), label: e.label, frame: e.frame, stack: e.stack, retries: e.retries } };
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
	if (code === "E_READINESS_TIMEOUT") {
		message = `${message}${frame === undefined ? "" : ` (frame ${frame})`}`;
	}
	const ctx: Record<string, unknown> = {};
	if (frame !== undefined) ctx.frame = frame;
	if (e.label !== undefined) ctx.label = e.label;
	if (composition !== undefined) ctx.composition = composition;
	if (e.stack !== undefined) ctx.pageStack = e.stack;
	const err = new MotioError(code, message, ctx) as MotioError & { retries?: number };
	if (typeof e.retries === "number") err.retries = e.retries;
	return err;
}

/**
 * One browser process with one page on the bundle (D-007). Injects the run context, checks the
 * protocol version and wraps the page API with a Node-side watchdog and crash detection.
 */
export class RenderPage {
	private failure: MotioError | undefined;
	private readonly waiters = new Set<(err: MotioError) => void>();
	private closed = false;
	private composition: string | undefined;
	/** Frame of the page call in flight, stamped on errors that interrupt it. */
	private inFlightFrame: number | undefined;

	private constructor(
		private readonly browser: Browser,
		private readonly page: Page,
		private readonly cdp: CDPSession,
		private readonly config: PageConfig,
	) {}

	/** Launches a browser, opens the bundle and completes the protocol handshake. */
	static async open(config: PageConfig): Promise<RenderPage> {
		const browser = await launchBrowser({
			executablePath: config.executablePath,
			chromiumOptions: config.chromiumOptions,
			width: Math.round(config.width * config.scale),
			height: Math.round(config.height * config.scale),
		});
		let rp: RenderPage | undefined;
		try {
			const pages = await browser.pages();
			const page = pages[0] ?? (await browser.newPage());
			const cdp = await page.createCDPSession();
			rp = new RenderPage(browser, page, cdp, config);
			rp.attachListeners();
			await rp.prepare();
			return rp;
		} catch (err) {
			if (rp) await rp.close();
			else await killBrowser(browser);
			throw err;
		}
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
				`Uncaught error in the page${frame === undefined ? "" : ` at frame ${frame}`}: ${message}. Fix the error in the composition code; see onBrowserLog for the stack.`,
				ctx,
			);
			// cancelRender() throws; called from a timer or a promise callback, its error arrives
			// here before the settle loop reports the cancellation. Ask the page which it was.
			void this.cancellation().then(
				(cancelled) =>
					this.fail(cancelled ? fromPageError(cancelled, frame, this.composition) : uncaught),
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
		this.browser.on("disconnected", () => {
			if (!this.closed) {
				this.fail(
					new MotioError(
						"E_BROWSER_CRASHED",
						"The browser process exited unexpectedly",
						this.failureContext(),
					),
				);
			}
		});
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
	private guard<T>(work: Promise<T>, timeoutMs: number, onTimeout: () => MotioError): Promise<T> {
		if (this.failure) return Promise.reject(this.failure);
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

	private async prepare(): Promise<void> {
		const c = this.config;
		const context: RunContext = {
			protocol: PROTOCOL_VERSION,
			inputProps: c.inputProps,
			env: c.envVariables,
			timeModel: "frame",
			readinessTimeoutMs: c.timeoutInMilliseconds,
			isRendering: true,
		};
		// Page.addScriptToEvaluateOnNewDocument on the page's main session, so it runs before any
		// page script on every navigation.
		await this.page.evaluateOnNewDocument(
			`Object.defineProperty(window, ${JSON.stringify(RUN_CONTEXT_GLOBAL)}, { value: Object.freeze(${JSON.stringify(context)}), writable: false, configurable: false });`,
		);
		// Set on the session that captures: emulation overrides are per CDP session, and a
		// device scale factor set elsewhere would not reach Page.captureScreenshot.
		await this.cdp.send("Emulation.setDeviceMetricsOverride", {
			width: c.width,
			height: c.height,
			deviceScaleFactor: c.scale,
			mobile: false,
		});
		if (c.transparent) {
			await this.cdp.send("Emulation.setDefaultBackgroundColorOverride", {
				color: { r: 0, g: 0, b: 0, a: 0 },
			});
		}
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
		let result: CallResult<T>;
		try {
			result = await this.guard(
				this.page.evaluate(expr) as Promise<CallResult<T>>,
				timeoutMs,
				onTimeout,
			);
		} finally {
			this.inFlightFrame = undefined;
		}
		if (!result.ok) throw fromPageError(result.error, frame, this.composition);
		return result.value;
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
		const report = await this.call<FrameReport>(
			"seek",
			[frame],
			timeout,
			() =>
				new MotioError(
					"E_SEEK_TIMEOUT",
					`Frame ${frame} did not become ready within ${timeout} ms and the page stopped responding. Look for a long-running loop in the composition, or raise timeoutInMilliseconds.`,
					ctx,
				),
			frame,
		);
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
		const res = await this.guard(
			this.cdp.send("Page.captureScreenshot", {
				format,
				...(format === "png" ? {} : { quality }),
				optimizeForSpeed: true,
				fromSurface: true,
				captureBeyondViewport: false,
			}),
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

	/** Closes the page and kills its browser process. Safe to call more than once. */
	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		await killBrowser(this.browser);
	}
}

/**
 * Closes a browser gracefully for up to 3 s, then kills its process. A browser that already
 * crashed rejects `close()`; the kill below is what guarantees the process is gone, so that
 * rejection carries no information and is not rethrown.
 */
async function killBrowser(browser: Browser): Promise<void> {
	const proc = browser.process();
	await Promise.race([
		browser.close().catch(() => undefined),
		new Promise((ok) => setTimeout(ok, 3_000)),
	]);
	if (proc && proc.exitCode === null && proc.signalCode === null) {
		proc.kill("SIGKILL");
		await new Promise<void>((ok) => {
			if (proc.exitCode !== null || proc.signalCode !== null) ok();
			else proc.once("exit", () => ok());
		});
	}
}
