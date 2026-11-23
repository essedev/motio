// Page side of record-gif.ts: calls the published @remotion/gif in the pinned Chrome and returns
// plain data. Bundled with esbuild; public API only.
import { Gif, getGifDurationInSeconds, preloadGif } from "@remotion/gif";
import { Thumbnail } from "@remotion/player";
import { createElement as h } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

type LoadInfo = {
	width: number;
	height: number;
	delays: number[];
	frames: ImageData[];
	loaded?: unknown;
};

export interface GifProbeSpec {
	/** URLs whose duration is read. */
	durations: string[];
	/** URLs loaded through <Gif onLoad>. */
	loads: string[];
	/** Timing cases rendered frame by frame in a Thumbnail. */
	timing: Array<{ src: string; fps: number; props: Record<string, unknown>; lastFrame: number }>;
	/** Canvas markup cases: props of <Gif> inside a 400x300 box (styled by `box`), at `frame`. */
	markup: Array<{
		src: string;
		props: Record<string, unknown>;
		frame?: number;
		box?: Record<string, unknown>;
	}>;
	/** Props rendered for their error message. */
	invalid: Array<{ src?: string; props: Record<string, unknown> }>;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** FNV-1a over the bytes, as 8 hex digits. */
const hash = (bytes: Uint8ClampedArray) => {
	let value = 0x811c9dc5;
	for (const byte of bytes) value = Math.imul(value ^ byte, 0x01000193) >>> 0;
	return value.toString(16).padStart(8, "0");
};

const message = (error: unknown) =>
	error instanceof Error ? `${error.name}: ${error.message}` : String(error);

function mount(
	component: () => unknown,
	frame: number,
	fps: number,
	onError?: (error: Error) => void,
) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	const render = (f: number) =>
		flushSync(() =>
			root.render(
				h(Thumbnail, {
					component: component as never,
					durationInFrames: 1000,
					compositionWidth: 400,
					compositionHeight: 300,
					fps,
					frameToDisplay: f,
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
	render(frame);
	return {
		host,
		render,
		unmount: () => {
			root.unmount();
			host.remove();
		},
	};
}

async function loadInfo(src: string): Promise<LoadInfo | { error: string }> {
	let info: LoadInfo | null = null;
	let failure: string | null = null;
	const view = mount(
		() =>
			h(Gif, {
				src,
				onLoad: (i: LoadInfo) => {
					info = i;
				},
				onError: (e: Error) => {
					failure = message(e);
				},
			}),
		0,
		30,
	);
	for (let i = 0; i < 400 && !info && !failure; i++) await sleep(10);
	view.unmount();
	if (failure) return { error: failure };
	if (!info) return { error: "timeout" };
	const loaded = info as LoadInfo;
	return {
		width: loaded.width,
		height: loaded.height,
		delays: loaded.delays,
		keys: Object.keys(loaded),
		loaded: loaded.loaded ?? null,
		frameType: loaded.frames[0]?.constructor.name ?? null,
		frames: loaded.frames.map((f) => `${f.width}x${f.height}:${hash(f.data)}`),
	} as never;
}

export async function runGifProbe(spec: GifProbeSpec) {
	const durations: Record<string, unknown> = {};
	for (const url of spec.durations) {
		try {
			durations[url] = { out: await getGifDurationInSeconds(url) };
		} catch (error) {
			durations[url] = { error: message(error) };
		}
	}

	const loads: Record<string, unknown> = {};
	for (const url of spec.loads) {
		loads[url] = await loadInfo(url);
	}

	// preloadGif(): what it returns and resolves to.
	const preload = preloadGif(spec.loads[0] as string);
	const preloadKeys = Object.keys(preload);
	const preloadValue = await preload.waitUntilDone();
	preload.free();

	// Which decoded frame the canvas shows at each composition frame.
	const timing = [];
	for (const c of spec.timing) {
		let info: LoadInfo | null = null;
		const view = mount(
			() =>
				h(Gif, {
					src: c.src,
					...c.props,
					onLoad: (i: LoadInfo) => {
						info = i;
					},
				}),
			0,
			c.fps,
		);
		for (let i = 0; i < 400 && !info; i++) await sleep(10);
		const loaded = info as LoadInfo | null;
		if (!loaded) throw new Error(`no onLoad for ${c.src}`);
		const shown: Array<number | string> = [];
		for (let frame = 0; frame <= c.lastFrame; frame++) {
			view.render(frame);
			await nextFrame();
			const canvas = view.host.querySelector("canvas");
			if (!canvas) {
				shown.push("unmounted");
				continue;
			}
			const data = (canvas.getContext("2d") as CanvasRenderingContext2D).getImageData(
				0,
				0,
				canvas.width,
				canvas.height,
			).data;
			const index = loaded.frames.findIndex((f) => f.data.every((v, i) => v === data[i]));
			shown.push(index === -1 ? "other" : index);
		}
		view.unmount();
		timing.push({ ...c, frames: shown });
	}

	// The canvas element after the GIF has loaded and been drawn.
	const markup = [];
	for (const c of spec.markup) {
		let loaded = false;
		const view = mount(
			() =>
				h(
					"div",
					{ style: { width: 400, height: 300, ...c.box } },
					h(Gif, {
						src: c.src,
						...c.props,
						onLoad: () => {
							loaded = true;
						},
					}),
				),
			c.frame ?? 0,
			30,
		);
		for (let i = 0; i < 100 && !loaded; i++) await sleep(10);
		await nextFrame();
		await nextFrame();
		const canvas = view.host.querySelector("canvas");
		const pixels = canvas
			? hash(
					(canvas.getContext("2d") as CanvasRenderingContext2D).getImageData(
						0,
						0,
						canvas.width,
						canvas.height,
					).data,
				)
			: null;
		const html = view.host.innerHTML.replace(/^.*?class="__remotion-player">/, "");
		markup.push({ ...c, html, pixels });
		view.unmount();
	}

	const invalid = [];
	for (const c of spec.invalid) {
		let error: string | null = null;
		const view = mount(
			() => h(Gif, { ...(c.src !== undefined ? { src: c.src } : {}), ...c.props } as never),
			0,
			30,
			(e) => {
				error = message(e);
			},
		);
		await sleep(50);
		view.unmount();
		invalid.push({ ...c, error });
	}

	return {
		durations,
		loads,
		preload: { keys: preloadKeys, value: preloadValue ?? null },
		timing,
		markup,
		invalid,
	};
}
