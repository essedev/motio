/**
 * A minimal page runtime implementing the frame protocol (PageApi), for renderer integration
 * tests. It follows ARCHITECTURE "The page and the frame protocol" in a reduced form: flushSync
 * render, frame attribute, readiness handles with labels and timeouts, settle until no handle is
 * open and the DOM stopped changing for two yields, then fonts.
 */
import {
	type CompositionInfo,
	FRAME_ATTRIBUTE,
	type FrameReport,
	PAGE_API_GLOBAL,
	type PageApi,
	type PageError,
	PROTOCOL_VERSION,
	type ResolvedComposition,
	RUN_CONTEXT_GLOBAL,
	type RunContext,
} from "@motiojs/core/protocol";
import { type ComponentType, createContext, useContext } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

/** A composition registered with the fixture runtime. */
export interface FixtureComposition {
	id: string;
	width: number;
	height: number;
	fps: number;
	durationInFrames: number;
	defaultProps: Record<string, unknown>;
	component: ComponentType<{ props: Record<string, unknown> }>;
	calculateMetadata?: (props: Record<string, unknown>) => Partial<ResolvedComposition>;
}

declare global {
	interface Window {
		[RUN_CONTEXT_GLOBAL]?: RunContext;
		[PAGE_API_GLOBAL]?: PageApi;
	}
}

const FrameContext = createContext(0);

/** The current frame. */
export const useCurrentFrame = (): number => useContext(FrameContext);

interface Handle {
	label: string;
	created: number;
	timeoutMs: number;
	retries: number;
}

const handles = new Map<number, Handle>();
let nextHandle = 1;

/** Opens a readiness handle; the frame is not captured until it is released. */
export function delayRender(
	label: string,
	options: { timeoutMs?: number; retries?: number } = {},
): number {
	const id = nextHandle++;
	handles.set(id, {
		label,
		created: performance.now(),
		timeoutMs: options.timeoutMs ?? context().readinessTimeoutMs,
		retries: options.retries ?? 0,
	});
	return id;
}

/** Releases a readiness handle. */
export function continueRender(id: number): void {
	handles.delete(id);
}

function context(): RunContext {
	const c = window[RUN_CONTEXT_GLOBAL];
	if (!c) throw new Error("run context missing: the renderer injects it before page scripts");
	return c;
}

/** Input props from the run context. */
export function getInputProps(): Record<string, unknown> {
	return context().inputProps;
}

const macrotask = () => new Promise<void>((r) => setTimeout(r, 0));

function pageError(
	code: PageError["code"],
	message: string,
	extra: Partial<PageError> = {},
): PageError {
	return { code, message, ...extra };
}

/** Installs `window.__motio` for the given compositions. */
export function installRuntime(compositions: FixtureComposition[]): void {
	const rootEl = document.getElementById("root");
	if (!rootEl) throw new Error("#root missing");
	let renderError: unknown;
	const root = createRoot(rootEl, {
		onUncaughtError: (error) => {
			renderError = error;
		},
	});
	let current: { def: FixtureComposition; resolved: ResolvedComposition } | undefined;
	let mutations = 0;
	new MutationObserver((records) => {
		mutations += records.length;
	}).observe(document.documentElement, {
		subtree: true,
		childList: true,
		attributes: true,
		characterData: true,
	});

	const info = (c: FixtureComposition): CompositionInfo => ({
		id: c.id,
		width: c.width,
		height: c.height,
		fps: c.fps,
		durationInFrames: c.durationInFrames,
		defaultProps: c.defaultProps,
		hasCalculateMetadata: c.calculateMetadata !== undefined,
		isStill: false,
		defaultCodec: null,
		defaultOutName: null,
		defaultPixelFormat: null,
		defaultVideoImageFormat: null,
	});

	const override = getInputProps().__fixtureProtocol;
	window[PAGE_API_GLOBAL] = {
		protocol: typeof override === "number" ? override : PROTOCOL_VERSION,
		async getCompositions() {
			return compositions.map(info);
		},
		async setComposition(id, props) {
			const def = compositions.find((c) => c.id === id);
			if (!def) throw pageError("E_COMPOSITION_NOT_FOUND", `No composition "${id}"`);
			let resolved: ResolvedComposition = { ...info(def), props };
			if (def.calculateMetadata) {
				try {
					resolved = { ...resolved, ...def.calculateMetadata(props) };
				} catch (e) {
					throw pageError("E_CALCULATE_METADATA", String((e as Error).message ?? e));
				}
			}
			rootEl.style.width = `${resolved.width}px`;
			rootEl.style.height = `${resolved.height}px`;
			current = { def, resolved };
			return resolved;
		},
		async seek(frame): Promise<FrameReport> {
			if (!current)
				throw pageError("E_INVALID_COMPOSITION", "seek() before setComposition()", { frame });
			const { def, resolved } = current;
			const t0 = performance.now();
			renderError = undefined;
			const Component = def.component;
			flushSync(() =>
				root.render(
					<FrameContext.Provider value={frame}>
						<Component props={resolved.props} />
					</FrameContext.Provider>,
				),
			);
			document.documentElement.setAttribute(FRAME_ATTRIBUTE, String(frame));
			const renderMs = performance.now() - t0;
			const fail = () => {
				const e = renderError as Error;
				return pageError("E_RENDER_ERROR", e?.message ?? String(e), {
					frame,
					stack: e?.stack ?? "",
				});
			};
			if (renderError !== undefined) throw fail();
			let quiet = 0;
			while (quiet < 2) {
				const before = mutations;
				await macrotask();
				if (renderError !== undefined) throw fail();
				const now = performance.now();
				for (const h of handles.values()) {
					if (now - h.created > h.timeoutMs) {
						throw {
							...pageError(
								"E_READINESS_TIMEOUT",
								`A delayRender() "${h.label}" was called but not cleared after ${h.timeoutMs}ms`,
								{ frame, label: h.label },
							),
							retries: h.retries,
						};
					}
				}
				quiet = handles.size === 0 && mutations === before ? quiet + 1 : 0;
			}
			await document.fonts.ready;
			return {
				frame: Number(document.documentElement.getAttribute(FRAME_ATTRIBUTE)),
				warnings: [],
				audio: [],
				timings: { renderMs, settleMs: performance.now() - t0 - renderMs },
			};
		},
	};
}
