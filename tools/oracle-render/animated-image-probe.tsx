// Page side of record-animated-image.ts: renders the published <AnimatedImage> of `remotion` in a
// Thumbnail of @remotion/player in the pinned Chrome and returns plain data (public API only).
// The fixture frames are solid colours, so the frame shown is read from the canvas centre.
import { Thumbnail } from "@remotion/player";
import { createElement as h } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { AnimatedImage } from "remotion";

export interface AnimatedImageProbeSpec {
	colors: number[][];
	/** Composition frames 0..lastFrame are read for each case. */
	timing: Array<{ src: string; fps: number; props: Record<string, unknown>; lastFrame: number }>;
	/** The canvas element after the first frame is drawn, inside a 400x300 box. */
	markup: Array<{ src: string; props: Record<string, unknown> }>;
	/** Props whose failure is recorded (the error boundary's or onError's message). */
	invalid: Array<{ src: string; props: Record<string, unknown> }>;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const message = (error: unknown) =>
	error instanceof Error ? `${error.name}: ${error.message}` : String(error);

function mount(component: () => unknown, fps: number, onError?: (error: Error) => void) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
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
		render,
		unmount: () => {
			root.unmount();
			host.remove();
		},
	};
}

/** The colour index at the canvas centre, "clear" for a transparent pixel, null without canvas. */
function shown(host: HTMLElement, colors: number[][]): number | "clear" | "other" | null {
	const canvas = host.querySelector("canvas");
	if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
	const [r, g, b, a] = (canvas.getContext("2d") as CanvasRenderingContext2D).getImageData(
		Math.floor(canvas.width / 2),
		Math.floor(canvas.height / 2),
		1,
		1,
	).data as unknown as number[];
	if (a === 0) return "clear";
	let best = -1;
	let distance = Number.POSITIVE_INFINITY;
	colors.forEach(([cr, cg, cb], i) => {
		const d =
			Math.abs((r ?? 0) - (cr ?? 0)) +
			Math.abs((g ?? 0) - (cg ?? 0)) +
			Math.abs((b ?? 0) - (cb ?? 0));
		if (d < distance) {
			distance = d;
			best = i;
		}
	});
	return distance <= 12 ? best : "other";
}

/** Waits until the value read stays the same for `stable` animation frames (at most `max`). */
async function settle<T>(read: () => T, stable = 4, max = 120): Promise<T> {
	let last = read();
	let same = 0;
	for (let i = 0; i < max && same < stable; i++) {
		await nextFrame();
		const value = read();
		if (value === last) same++;
		else {
			same = 0;
			last = value;
		}
	}
	return last;
}

export async function runAnimatedImageProbe(spec: AnimatedImageProbeSpec) {
	const timing = [];
	for (const c of spec.timing) {
		const view = mount(() => h(AnimatedImage, { src: c.src, ...c.props }), c.fps);
		view.render(0);
		// The first frame needs the download and the decoder.
		for (let i = 0; i < 300 && typeof shown(view.host, spec.colors) !== "number"; i++)
			await sleep(10);
		const frames: Array<number | string | null> = [];
		for (let frame = 0; frame <= c.lastFrame; frame++) {
			view.render(frame);
			frames.push(await settle(() => shown(view.host, spec.colors)));
		}
		view.unmount();
		timing.push({ ...c, frames });
	}

	const markup = [];
	for (const c of spec.markup) {
		const view = mount(
			() =>
				h(
					"div",
					{ style: { width: 400, height: 300 } },
					h(AnimatedImage, { src: c.src, ...c.props }),
				),
			30,
		);
		view.render(0);
		for (let i = 0; i < 300 && typeof shown(view.host, spec.colors) !== "number"; i++)
			await sleep(10);
		await settle(() => shown(view.host, spec.colors));
		const canvas = view.host.querySelector("canvas");
		markup.push({
			...c,
			html: view.host.innerHTML.replace(/^.*?class="__remotion-player">/, ""),
			bitmap: canvas ? [canvas.width, canvas.height] : null,
			layout: canvas ? [canvas.offsetWidth, canvas.offsetHeight] : null,
			centre: shown(view.host, spec.colors),
		});
		view.unmount();
	}

	const invalid = [];
	for (const c of spec.invalid) {
		let error: string | null = null;
		let onErrorMessage: string | null = null;
		const view = mount(
			() =>
				h(AnimatedImage, {
					src: c.src,
					...c.props,
					...("onError" in c.props
						? {
								onError: (e: Error) => {
									onErrorMessage = message(e);
								},
							}
						: {}),
				} as never),
			30,
			(e) => {
				error = message(e);
			},
		);
		view.render(0);
		await sleep(1000);
		const canvas = view.host.querySelector("canvas");
		view.unmount();
		invalid.push({ ...c, error, onError: onErrorMessage, canvas: canvas !== null });
	}
	return { timing, markup, invalid };
}
