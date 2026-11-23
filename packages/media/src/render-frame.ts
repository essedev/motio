import { continueRender, delayRender } from "@motiojs/core";
import { useLayoutEffect, useRef } from "react";
import { frameUrl, locateFrame, serviceError } from "./media-service.js";
import { toError } from "./render-errors.js";

/** Options shared by the render-mode hooks. */
export interface RenderFrameOptions {
	enabled: boolean;
	src: string;
	/** Source time of the frame, in seconds. */
	time: number;
	component: string;
	delay: { timeoutInMilliseconds?: number; retries?: number };
	onError: (error: Error) => void;
}

/**
 * The `<img>` path of `<OffthreadVideo>` in a render: the image of the source frame the host
 * extracted (`floor` rule, D-015), with a readiness handle held until it is loaded and decoded.
 * Returns the URL to show and the load and error handlers for the `<img>`.
 */
export function useExtractedImage(
	options: RenderFrameOptions & {
		transparent: boolean;
		onLoaded?: ((img: HTMLImageElement) => void) | undefined;
	},
): {
	url: string | null;
	onLoad: (img: HTMLImageElement) => void;
	onError: () => void;
} {
	const { enabled, src, time, component } = options;
	const url = enabled ? frameUrl(src, time, "floor", options.transparent) : null;
	const handle = useRef<number | null>(null);
	const latest = useRef(options);
	latest.current = options;

	// One handle per frame URL; `time`, `src` and `component` only label it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useLayoutEffect(() => {
		if (url === null) return;
		const h = delayRender(
			`Loading the frame at ${time}s of <${component}> src=${src}`,
			latest.current.delay,
		);
		handle.current = h;
		return () => {
			if (handle.current === h) handle.current = null;
			continueRender(h);
		};
	}, [url]);

	const release = () => {
		if (handle.current !== null) continueRender(handle.current);
		handle.current = null;
	};
	return {
		url,
		onLoad: (img) => {
			const shownUrl = url;
			const done = () => {
				if (shownUrl !== url) return;
				latest.current.onLoaded?.(img);
				release();
			};
			img.decode().then(done, done);
		},
		onError: () => {
			if (url === null) return;
			const failedUrl = url;
			fetch(failedUrl)
				.then(async (res) =>
					res.ok
						? new Error(`The frame image of ${src} at ${time}s could not be decoded`)
						: serviceError(res, `<${component}> could not show ${src} at ${time}s`),
				)
				.catch(toError)
				.then((err) => {
					latest.current.onError(err);
					release();
				});
		},
	};
}

function waitForEvent(el: HTMLMediaElement, event: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const onEvent = () => {
			cleanup();
			resolve();
		};
		const onError = () => {
			cleanup();
			reject(
				new Error(
					`The media element failed (${el.error?.message || `code ${el.error?.code ?? "unknown"}`})`,
				),
			);
		};
		const cleanup = () => {
			el.removeEventListener(event, onEvent);
			el.removeEventListener("error", onError);
		};
		el.addEventListener(event, onEvent);
		el.addEventListener("error", onError);
	});
}

/** Seeks a native element and resolves once it shows the new position (`seeked`, D-016). */
export async function seekElement(el: HTMLMediaElement, time: number): Promise<void> {
	if (el.error) throw new Error(`The media element failed (${el.error.message || el.error.code})`);
	if (el.readyState < 1) await waitForEvent(el, "loadedmetadata");
	if (!el.seeking && el.readyState >= 2 && Math.abs(el.currentTime - time) < 1e-9) return;
	const seeked = waitForEvent(el, "seeked");
	el.currentTime = time;
	await seeked;
}

/**
 * The native path of the HTML5 `<Video>` in a render (D-016): the element is seeked to the
 * middle of the source frame the `nearest` rule picks, from timestamps the host reads, and the
 * frame waits for `seeked`.
 */
export function useSeekedVideo(
	element: HTMLVideoElement | null,
	options: RenderFrameOptions & { onShown?: ((video: HTMLVideoElement) => void) | undefined },
): void {
	const { enabled, src, time, component } = options;
	const latest = useRef(options);
	latest.current = options;

	useLayoutEffect(() => {
		if (!enabled || !element) return;
		const h = delayRender(`Seeking <${component}> src=${src} to ${time}s`, latest.current.delay);
		let active = true;
		locateFrame(src, time, "nearest")
			.then((loc) => (active ? seekElement(element, loc.seekTime) : undefined))
			.then(
				() => {
					if (!active) return;
					latest.current.onShown?.(element);
					continueRender(h);
				},
				(err: unknown) => {
					if (!active) return;
					latest.current.onError(
						new Error(`<${component}> could not show ${src} at ${time}s: ${toError(err).message}`),
					);
					continueRender(h);
				},
			);
		return () => {
			active = false;
			continueRender(h);
		};
	}, [enabled, element, src, time, component]);
}

/** How a frame is fitted into the `<canvas>` of the `@remotion/media` `<Video>`. */
export type ObjectFit = "contain" | "cover" | "fill" | "none" | "scale-down";

/**
 * The `<canvas>` path of the `@remotion/media` `<Video>` in a render: the host's extracted frame
 * (`floor` rule) drawn into the canvas at the source's size, the readiness handle held until it is
 * drawn. `onFrame` receives the frame as an `ImageBitmap`.
 */
export function useCanvasFrame(
	canvas: HTMLCanvasElement | null,
	options: RenderFrameOptions & {
		headless: boolean;
		onFrame?: ((frame: ImageBitmap) => void) | undefined;
	},
): void {
	const { enabled, src, time, component, headless } = options;
	const latest = useRef(options);
	latest.current = options;

	useLayoutEffect(() => {
		if (!enabled || (!canvas && !headless)) return;
		const h = delayRender(
			`Loading the frame at ${time}s of <${component}> src=${src}`,
			latest.current.delay,
		);
		let active = true;
		const url = frameUrl(src, time, "floor", true);
		(async () => {
			const res = await fetch(url);
			if (!res.ok)
				throw await serviceError(res, `<${component}> could not show ${src} at ${time}s`);
			const bitmap = await createImageBitmap(await res.blob());
			if (!active) {
				bitmap.close();
				return;
			}
			if (canvas) {
				if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
				if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
				const ctx = canvas.getContext("2d");
				if (!ctx) throw new Error(`<${component}>: no 2D context for its <canvas>`);
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				ctx.drawImage(bitmap, 0, 0);
			}
			latest.current.onFrame?.(bitmap);
		})().then(
			() => {
				if (active) continueRender(h);
			},
			(err: unknown) => {
				if (!active) return;
				latest.current.onError(toError(err));
				continueRender(h);
			},
		);
		return () => {
			active = false;
			continueRender(h);
		};
	}, [enabled, canvas, headless, src, time, component]);
}
