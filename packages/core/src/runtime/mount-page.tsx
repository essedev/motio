import { Component, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import {
	CompositionRegistry,
	CompositionRegistryContext,
	type CompositionSelection,
	CompositionSelectionContext,
} from "../composition/manager.js";
import { getRoot, waitForRoot } from "../composition/register-root.js";
import {
	applyResolvedMetadata,
	CalculateMetadataError,
	resolveComposition,
	toCompositionInfo,
} from "../composition/resolve.js";
import { getRunContext } from "../environment.js";
import { audioIntents } from "../media/audio-intents.js";
import {
	type CompositionInfo,
	FRAME_ATTRIBUTE,
	type FrameReport,
	type FrameWarning,
	PAGE_API_GLOBAL,
	type PageApi,
	type PageError,
	type PageErrorCode,
	PROTOCOL_VERSION,
	type ResolvedComposition,
	type SetCompositionOptions,
} from "../protocol.js";
import { readiness } from "../readiness/registry.js";
import { getVirtualClock, realTimers } from "../real-time.js";
import type { VideoConfig } from "../timeline/contexts.js";
import { seekAnimations } from "./animations.js";
import { FontFallbackDetector } from "./fonts.js";
import { isPageError, toPageError } from "./page-error.js";
import { ImageTracker, settle } from "./settle.js";

/** Options of `mountPage()`. */
export interface MountPageOptions {
	/** Element the canvas is created in. Defaults to `#motio-root`, else `document.body`. */
	container?: HTMLElement;
	/** Install the API as `window.__motio`. Default true. */
	installGlobal?: boolean;
}

interface BoundaryProps {
	onError: (error: unknown) => void;
	children?: ReactNode;
}

/** Catches render errors in the root and the composition, in React 18 and 19 alike. */
class RuntimeBoundary extends Component<BoundaryProps, { failed: boolean }> {
	override state = { failed: false };
	static getDerivedStateFromError(): { failed: boolean } {
		return { failed: true };
	}
	override componentDidCatch(error: unknown, _info: ErrorInfo): void {
		this.props.onError(error);
	}
	override render(): ReactNode {
		return this.state.failed ? null : this.props.children;
	}
}

const CANVAS_ID = "motio-canvas";

/**
 * Base styles of the canvas. `border-box` sizing matches the reference renders (a padded box
 * keeps its declared width); `:where()` keeps the specificity at zero so user styles win.
 */
const CANVAS_CSS = `:where(#${CANVAS_ID}, #${CANVAS_ID} *, #${CANVAS_ID} *::before, #${CANVAS_ID} *::after) { box-sizing: border-box; }`;

function prepareDocument(container: HTMLElement): { canvas: HTMLElement; host: HTMLElement } {
	for (const el of [document.documentElement, document.body]) {
		el.style.margin = "0";
		el.style.padding = "0";
		el.style.overflow = "hidden";
		el.style.background = "transparent";
	}
	const style = document.createElement("style");
	style.textContent = CANVAS_CSS;
	document.head.appendChild(style);
	const host = document.createElement("div");
	host.id = "motio-root-host";
	host.style.display = "none";
	const canvas = document.createElement("div");
	canvas.id = CANVAS_ID;
	Object.assign(canvas.style, {
		position: "absolute",
		left: "0",
		top: "0",
		overflow: "hidden",
		width: "0px",
		height: "0px",
	});
	container.appendChild(host);
	container.appendChild(canvas);
	return { canvas, host };
}

function timeoutAfter<T>(promise: Promise<T>, ms: number, onTimeout: () => unknown): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = realTimers().setTimeout(() => reject(onTimeout()), ms);
		promise.then(
			(v) => {
				realTimers().clearTimeout(timer);
				resolve(v);
			},
			(e: unknown) => {
				realTimers().clearTimeout(timer);
				reject(e);
			},
		);
	});
}

/** The page runtime: owns the React root and implements the page API. */
class PageRuntime {
	readonly registry = new CompositionRegistry();
	private readonly reactRoot: Root;
	private readonly canvas: HTMLElement;
	private readonly images = new ImageTracker();
	private readonly fonts = new FontFallbackDetector();
	private rootElement: ReactNode = null;
	private selection: CompositionSelection | null = null;
	private renderError: unknown;
	/** True once the boundary caught an error: it renders nothing until remounted. */
	private failed = false;
	private generation = 0;
	private collected: Promise<void> | null = null;
	private metadataController: AbortController | null = null;
	private queue: Promise<unknown> = Promise.resolve();

	constructor(container: HTMLElement) {
		const { canvas, host } = prepareDocument(container);
		this.canvas = canvas;
		this.reactRoot = createRoot(host);
	}

	private timeoutMs(): number {
		return readiness.defaultTimeoutMs();
	}

	/** Serialises page API calls: each runs after the previous one settled. */
	enqueue<T>(task: () => Promise<T>): Promise<T> {
		const run = this.queue.then(task, task);
		this.queue = run.catch(() => undefined);
		return run;
	}

	private takeRenderError = (): unknown => {
		const e = this.renderError;
		this.renderError = undefined;
		return e;
	};

	private onError = (error: unknown): void => {
		this.failed = true;
		if (this.renderError === undefined) this.renderError = error;
	};

	private render(): void {
		const tree = (
			<RuntimeBoundary key={this.generation} onError={this.onError}>
				<CompositionRegistryContext.Provider value={this.registry}>
					<CompositionSelectionContext.Provider value={this.selection}>
						{this.rootElement}
					</CompositionSelectionContext.Provider>
				</CompositionRegistryContext.Provider>
			</RuntimeBoundary>
		);
		try {
			flushSync(() => this.reactRoot.render(tree));
		} catch (err) {
			// React 18 rethrows render errors from flushSync; React 19 reports them to the boundary.
			this.onError(err);
		}
	}

	/** Remounts the boundary and the composition after a render error, so a retry can succeed. */
	private resetAfterError(): void {
		this.renderError = undefined;
		this.failed = false;
		this.generation++;
		if (this.selection) this.selection = { ...this.selection, generation: this.generation };
	}

	private async waitForRootComponent(): Promise<ComponentType> {
		const existing = getRoot();
		if (existing) return existing;
		const ms = this.timeoutMs();
		return timeoutAfter(waitForRoot(), ms, () =>
			toPageError(
				"E_READINESS_TIMEOUT",
				`registerRoot() was not called within ${ms}ms. The entry file must call registerRoot() with the root component.`,
				{ label: "registerRoot()" },
			),
		);
	}

	private collect(): Promise<void> {
		if (!this.collected) {
			this.collected = (async () => {
				const root = await this.waitForRootComponent();
				const Root = root;
				this.rootElement = <Root />;
				this.render();
				await this.settleOrThrow(undefined, "E_INVALID_COMPOSITION");
			})();
			this.collected.catch(() => {
				// A failed collection is retried by the next getCompositions() call.
				this.collected = null;
			});
		}
		return this.collected;
	}

	private async settleOrThrow(frame: number | undefined, renderCode: PageErrorCode) {
		try {
			return await settle({
				registry: readiness,
				root: this.canvas,
				...(frame === undefined ? {} : { frame }),
				takeRenderError: this.takeRenderError,
				images: this.images,
				imageTimeoutMs: this.timeoutMs(),
			});
		} catch (err) {
			if (isPageError(err) && err.code === "E_RENDER_ERROR" && renderCode !== "E_RENDER_ERROR") {
				throw { ...err, code: renderCode };
			}
			throw err;
		}
	}

	async getCompositions(): Promise<CompositionInfo[]> {
		await this.collect();
		return this.registry.list().map(toCompositionInfo);
	}

	async setComposition(
		id: string,
		inputProps: Record<string, unknown>,
		options: SetCompositionOptions = {},
	): Promise<ResolvedComposition> {
		await this.collect();
		const entry = this.registry.get(id);
		if (!entry) {
			const ids = this.registry.list().map((c) => c.id);
			throw toPageError(
				"E_COMPOSITION_NOT_FOUND",
				`No composition with the id "${id}". Available: ${ids.length ? ids.map((i) => `"${i}"`).join(", ") : "none"}.`,
			);
		}
		this.metadataController?.abort();
		const controller = new AbortController();
		this.metadataController = controller;
		const ms = this.timeoutMs();
		const label = `calculateMetadata() of composition "${id}"`;
		let config: VideoConfig;
		try {
			config = options.resolved
				? applyResolvedMetadata(entry, options.resolved)
				: await timeoutAfter(
						resolveComposition(entry, inputProps ?? {}, {
							signal: controller.signal,
							isRendering: getRunContext()?.isRendering === true,
						}),
						ms,
						() =>
							toPageError("E_READINESS_TIMEOUT", `${label} did not resolve within ${ms}ms.`, {
								label,
							}),
					);
		} catch (err) {
			if (isPageError(err)) throw err;
			const code =
				err instanceof CalculateMetadataError ? "E_CALCULATE_METADATA" : "E_INVALID_COMPOSITION";
			throw toPageError(code, err);
		}
		Object.assign(this.canvas.style, { width: `${config.width}px`, height: `${config.height}px` });
		this.generation++;
		this.selection = {
			id,
			config,
			frame: 0,
			canvas: this.canvas,
			generation: this.generation,
		};
		return { ...toCompositionInfo(entry), ...config };
	}

	async seek(frame: number): Promise<FrameReport> {
		const selection = this.selection;
		if (!selection) {
			throw toPageError(
				"E_COMPOSITION_NOT_FOUND",
				"seek() was called before setComposition(): select a composition first.",
				{ frame },
			);
		}
		const { durationInFrames, fps } = selection.config;
		if (!Number.isInteger(frame) || frame < 0 || frame >= durationInFrames) {
			throw toPageError(
				"E_RENDER_ERROR",
				`Frame ${frame} is out of range: composition "${selection.id}" has frames 0 to ${durationInFrames - 1}.`,
				{ frame },
			);
		}
		const real = realTimers();
		const t0 = real.now();
		if (this.failed) this.resetAfterError();
		const clock = getVirtualClock();
		clock?.setFrame(frame, fps);
		this.selection = { ...(this.selection as CompositionSelection), frame };
		this.render();
		document.documentElement.setAttribute(FRAME_ATTRIBUTE, String(frame));
		if (clock) {
			try {
				clock.runDue((fn) => flushSync(fn));
			} catch (err) {
				this.onError(err);
			}
		}
		const warnings: FrameWarning[] = [...seekAnimations(frame, fps)];
		const renderMs = real.now() - t0;
		const settled = await this.settleOrThrow(frame, "E_RENDER_ERROR");
		// Elements mounted while settling may carry new animations.
		for (const w of seekAnimations(frame, fps)) {
			if (!warnings.some((x) => x.message === w.message)) warnings.push(w);
		}
		warnings.push(...settled.warnings, ...this.fonts.scan(this.canvas));
		const readBack = Number(document.documentElement.getAttribute(FRAME_ATTRIBUTE));
		if (readBack !== frame) {
			warnings.push({
				code: "W_FRAME_MISMATCH",
				message: `Asked for frame ${frame} but the page shows frame ${readBack}.`,
			});
		}
		return {
			frame: readBack,
			warnings,
			audio: audioIntents.snapshot(),
			timings: { renderMs, settleMs: settled.settleMs },
		};
	}
}

function wrap<A extends unknown[], T>(
	runtime: PageRuntime,
	fn: (...args: A) => Promise<T>,
	fallback: PageErrorCode,
): (...args: A) => Promise<T> {
	return (...args: A) =>
		runtime.enqueue(async () => {
			try {
				return await fn(...args);
			} catch (err) {
				throw isPageError(err) ? err : toPageError(fallback, err);
			}
		});
}

let installed: PageApi | null = null;

/**
 * Mounts the page runtime: reads the run context, renders the registered root to collect its
 * compositions, and installs the page API (`window.__motio`) the renderer drives. Called by the
 * bundle's page after it imported the project's entry.
 */
export function mountPage(options: MountPageOptions = {}): PageApi {
	const install = options.installGlobal !== false;
	if (install && installed) return installed;
	const runtime = new PageRuntime(
		options.container ?? document.getElementById("motio-root") ?? document.body,
	);
	const api: PageApi = {
		protocol: PROTOCOL_VERSION,
		getCompositions: wrap(runtime, () => runtime.getCompositions(), "E_INVALID_COMPOSITION"),
		setComposition: wrap(
			runtime,
			(id: string, props: Record<string, unknown>, options?: SetCompositionOptions) =>
				runtime.setComposition(id, props, options),
			"E_INVALID_COMPOSITION",
		),
		seek: wrap(runtime, (frame: number) => runtime.seek(frame), "E_RENDER_ERROR"),
		cancelled: () => {
			const error = readiness.cancelled();
			if (!error) return null;
			const out: PageError = { code: "E_CANCELLED", message: error.message };
			if (error.stack !== undefined) out.stack = error.stack;
			return out;
		},
	};
	if (install) {
		Object.defineProperty(window, PAGE_API_GLOBAL, {
			value: api,
			writable: false,
			configurable: false,
			enumerable: true,
		});
		installed = api;
	}
	return api;
}
