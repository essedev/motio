// Page side of record-rive.ts: renders the published @remotion/rive in a Thumbnail in the pinned
// Chrome and returns plain data. Bundled with esbuild; public API only.
import { Thumbnail } from "@remotion/player";
import { RemotionRiveCanvas } from "@remotion/rive";
import { createElement as h } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

export interface RiveProbeSpec {
	/** Timing cases: props of <RemotionRiveCanvas>, composition fps, frames rendered in order. */
	timing: Array<{ src: string; fps: number; props: Record<string, unknown>; frames: number[] }>;
	/** Markup cases: props at `frame` in a 400x300 composition. */
	markup: Array<{ src: string; props: Record<string, unknown>; frame?: number }>;
	/** Props rendered for the error they raise. */
	invalid: Array<{ src?: string; props: Record<string, unknown> }>;
}

type RiveRef = {
	getAnimationInstance(): { time: number; didLoop: boolean } | null;
	getArtboard(): { name: string; bounds: unknown } | null;
	getRenderer(): unknown;
	getCanvas(): unknown;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** FNV-1a over the bytes, as 8 hex digits. */
const hash = (bytes: Uint8ClampedArray) => {
	let value = 0x811c9dc5;
	for (const byte of bytes) value = Math.imul(value ^ byte, 0x01000193) >>> 0;
	return value.toString(16).padStart(8, "0");
};

const describeError = (error: unknown) =>
	error instanceof Error
		? { name: error.name, message: error.message }
		: { name: typeof error, message: String(error) };

function mount(
	src: string | undefined,
	props: Record<string, unknown>,
	fps: number,
	onError?: (error: Error) => void,
) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	const ref: { current: RiveRef | null } = { current: null };
	const state = { loads: 0, file: null as unknown };
	// Stable across renders, as the docs ask for onLoad.
	const onLoad = (file: unknown) => {
		state.loads++;
		state.file = file;
	};
	const component = () =>
		h(RemotionRiveCanvas as never, {
			...(src === undefined ? {} : { src }),
			...props,
			ref,
			onLoad,
		});
	const render = (frame: number) =>
		flushSync(() =>
			root.render(
				h(Thumbnail, {
					component: component as never,
					durationInFrames: 1000,
					compositionWidth: 400,
					compositionHeight: 300,
					fps,
					frameToDisplay: frame,
					...(onError
						? {
								errorFallback: ({ error }: { error: Error }) => {
									onError(error);
									return null;
								},
							}
						: {}),
				}),
			),
		);
	return {
		host,
		ref,
		state,
		render,
		unmount: () => {
			root.unmount();
			host.remove();
		},
	};
}

const canvasHash = (host: HTMLElement) => {
	const canvas = host.querySelector("canvas");
	if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
	const copy = document.createElement("canvas");
	copy.width = canvas.width;
	copy.height = canvas.height;
	const context = copy.getContext("2d") as CanvasRenderingContext2D;
	context.drawImage(canvas, 0, 0);
	return hash(context.getImageData(0, 0, copy.width, copy.height).data);
};

export async function runRiveProbe(spec: RiveProbeSpec) {
	const timing = [];
	for (const c of spec.timing) {
		const view = mount(c.src, c.props, c.fps);
		const rows = [];
		for (const frame of c.frames) {
			view.render(frame);
			await nextFrame();
			// Not mounted before `from`; once mounted, the file loads asynchronously.
			const mounted = view.host.querySelector("canvas") !== null;
			for (let i = 0; mounted && i < 500 && !view.ref.current?.getAnimationInstance(); i++) {
				await sleep(10);
			}
			const instance = view.ref.current?.getAnimationInstance() ?? null;
			rows.push(instance ? { time: instance.time, didLoop: instance.didLoop } : null);
		}
		view.unmount();
		timing.push({ ...c, rows });
	}

	const markup = [];
	for (const c of spec.markup) {
		const view = mount(c.src, c.props, 30);
		view.render(c.frame ?? 0);
		for (let i = 0; i < 500 && view.state.loads === 0; i++) await sleep(10);
		await nextFrame();
		await nextFrame();
		const r = view.ref.current;
		const artboard = r?.getArtboard() ?? null;
		const file = view.state.file as { artboardCount?: () => number } | null;
		markup.push({
			...c,
			loads: view.state.loads,
			fileArtboards: file?.artboardCount?.() ?? null,
			ref: r
				? {
						keys: Object.keys(r).sort(),
						artboard: artboard ? { name: artboard.name, bounds: artboard.bounds } : null,
						instance: r.getAnimationInstance() !== null,
						renderer: r.getRenderer() !== null,
						canvas: r.getCanvas() !== null,
					}
				: null,
			html: view.host.querySelector("canvas")?.outerHTML ?? null,
			pixels: canvasHash(view.host),
		});
		view.unmount();
	}

	const invalid = [];
	for (const c of spec.invalid) {
		let error: unknown = null;
		const view = mount(c.src, c.props, 30, (e) => {
			error = e;
		});
		const errors: unknown[] = [];
		const onUnhandled = (event: PromiseRejectionEvent) => errors.push(event.reason);
		const onWindowError = (event: ErrorEvent) => errors.push(event.error);
		window.addEventListener("unhandledrejection", onUnhandled);
		window.addEventListener("error", onWindowError);
		try {
			view.render(0);
		} catch (e) {
			error = e;
		}
		for (let i = 0; i < 100 && error === null && view.state.loads === 0; i++) await sleep(10);
		await sleep(100);
		window.removeEventListener("unhandledrejection", onUnhandled);
		window.removeEventListener("error", onWindowError);
		invalid.push({
			...c,
			loads: view.state.loads,
			error: error === null ? null : describeError(error),
			unhandled: errors.map(describeError),
		});
		view.unmount();
	}

	return { timing, markup, invalid };
}
