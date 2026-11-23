// Browser entry of the <AnimatedImage> tests in the Player: renders the component in a Thumbnail
// at chosen frames (the setup of tools/oracle-render/animated-image-probe.tsx, so results compare
// with the recorded oracle case by case) and in a playing Player on the real clock. The fixture
// frames are solid colours, so the frame shown is read from the canvas centre.
import { AbsoluteFill, AnimatedImage, useCurrentFrame } from "@motiojs/core";
import { createRef, createElement as h } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Player } from "../player.js";
import { Thumbnail } from "../thumbnail.js";
import type { PlayerRef } from "../types.js";

let colors: number[][] = [];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const describeError = (error: unknown) =>
	error instanceof Error
		? { name: error.name, message: error.message, cause: describeCause(error.cause) }
		: { name: "", message: String(error), cause: null };
const describeCause = (cause: unknown) =>
	cause instanceof Error || cause instanceof DOMException
		? `${cause.name}: ${cause.message}`
		: null;

/** The colour index at the canvas centre, "clear" when transparent, null without a canvas. */
function shown(canvas: HTMLCanvasElement | null): number | "clear" | "other" | null {
	if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
	const context = canvas.getContext("2d");
	if (!context) return null;
	const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(
		Math.floor(canvas.width / 2),
		Math.floor(canvas.height / 2),
		1,
		1,
	).data;
	if (a === 0) return "clear";
	let best = -1;
	let distance = Number.POSITIVE_INFINITY;
	colors.forEach(([cr = 0, cg = 0, cb = 0], i) => {
		const d = Math.abs(r - cr) + Math.abs(g - cg) + Math.abs(b - cb);
		if (d < distance) {
			distance = d;
			best = i;
		}
	});
	return distance <= 12 ? best : "other";
}

function mountThumbnail(component: () => unknown, fps: number, onError?: (e: Error) => void) {
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
		canvas: () => host.querySelector("canvas"),
		unmount: () => {
			root.unmount();
			host.remove();
		},
	};
}

/** Waits until the canvas shows a fixture frame (the download and the first decode). */
async function waitForImage(canvas: () => HTMLCanvasElement | null, ms: number) {
	for (let i = 0; i < ms / 10 && canvas() && typeof shown(canvas()) !== "number"; i++) {
		await sleep(10);
	}
}

const playerRoot = createRoot(document.body.appendChild(document.createElement("div")));
const playerRef = createRef<PlayerRef>();

function PlayingScene({ src }: { src: string }) {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{ background: "black" }} data-frame={frame}>
			<AnimatedImage src={src} width={100} height={100} />
		</AbsoluteFill>
	);
}

const api = {
	setColors: (c: number[][]) => {
		colors = c;
	},
	/** The frame shown at composition frames 0..lastFrame, read after each render settles. */
	timing: async (src: string, fps: number, props: Record<string, unknown>, lastFrame: number) => {
		const view = mountThumbnail(() => h(AnimatedImage, { src, ...props } as never), fps);
		view.render(0);
		await waitForImage(view.canvas, 5000);
		const frames: Array<number | string | null> = [];
		let loaded = typeof shown(view.canvas()) === "number";
		for (let frame = 0; frame <= lastFrame; frame++) {
			view.render(frame);
			// Read in the same task: a frame in the cache is drawn in the commit itself. A canvas
			// that has just mounted (after `from`) first loads its file.
			let value = shown(view.canvas());
			if (!loaded && typeof value !== "number") {
				await waitForImage(view.canvas, 5000);
				value = shown(view.canvas());
			}
			loaded ||= typeof value === "number";
			frames.push(value);
		}
		view.unmount();
		return frames;
	},
	/** The canvas after the first frame is drawn, inside a 400x300 box. */
	markup: async (src: string, props: Record<string, unknown>) => {
		const view = mountThumbnail(
			() =>
				h(
					"div",
					{ style: { width: 400, height: 300 } },
					h(AnimatedImage, { src, ...props } as never),
				),
			30,
		);
		view.render(0);
		await waitForImage(view.canvas, 5000);
		const canvas = view.canvas();
		const result = {
			html: canvas?.outerHTML ?? null,
			bitmap: canvas ? [canvas.width, canvas.height] : null,
			layout: canvas ? [canvas.offsetWidth, canvas.offsetHeight] : null,
			centre: shown(canvas),
		};
		view.unmount();
		return result;
	},
	/** What an invalid prop or an unloadable file does: the thrown error, or what onError got. */
	invalid: async (src: string, props: Record<string, unknown>) => {
		let error: ReturnType<typeof describeError> | null = null;
		let onErrorValue: ReturnType<typeof describeError> | null = null;
		const view = mountThumbnail(
			() =>
				h(AnimatedImage, {
					src,
					...props,
					...("onError" in props
						? {
								onError: (e: Error) => {
									onErrorValue = describeError(e);
								},
							}
						: {}),
				} as never),
			30,
			(e) => {
				error = describeError(e);
			},
		);
		view.render(0);
		await sleep(1000);
		const canvas = view.canvas() !== null;
		view.unmount();
		return { error, onError: onErrorValue, canvas };
	},
	/**
	 * Plays a Player showing `src` for about `ms` milliseconds and samples, on every animation
	 * frame, the frame the composition rendered and the image frame on the canvas.
	 */
	play: (src: string, fps: number, ms: number) =>
		new Promise<Array<{ frame: number; shown: number | string | null }>>((resolve) => {
			playerRoot.render(
				<Player
					ref={playerRef}
					component={PlayingScene}
					inputProps={{ src }}
					durationInFrames={fps * 10}
					fps={fps}
					compositionWidth={200}
					compositionHeight={200}
				/>,
			);
			const read = () => {
				const stamp = document.querySelector<HTMLElement>("[data-frame]");
				const canvas = stamp?.querySelector("canvas") ?? null;
				return { frame: Number(stamp?.dataset.frame ?? -1), shown: shown(canvas) };
			};
			const start = async () => {
				for (let i = 0; i < 500 && typeof read().shown !== "number"; i++) await sleep(10);
				const player = playerRef.current as PlayerRef;
				const samples: Array<{ frame: number; shown: number | string | null }> = [];
				const began = performance.now();
				player.play();
				const tick = () => {
					samples.push(read());
					if (performance.now() - began < ms) {
						requestAnimationFrame(tick);
						return;
					}
					player.pause();
					playerRoot.render(null);
					resolve(samples);
				};
				requestAnimationFrame(tick);
			};
			void start();
		}),
};

(window as unknown as { __animatedImageTest: typeof api }).__animatedImageTest = api;
document.body.dataset.ready = "true";
