// <AnimatedImage> in a simulated DOM with a stand-in ImageDecoder, createImageBitmap and 2D
// context, so loading, readiness, drawing calls, errors and markup can be checked without a
// browser. Decoding real files and the pixels drawn are covered in the pinned Chrome by
// packages/player/src/animated-image.integration.test.ts and
// packages/motio/src/animated-image.integration.test.ts.
import { act, createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readiness } from "../readiness/registry.js";
import { renderAtFrame } from "../testing/harness.js";
import { AnimatedImage, animatedImageFitRect } from "./animated-image.js";
import { acquireAnimatedImage, sniffImageType } from "./animated-image-loader.js";

const GIF_BYTES = new TextEncoder().encode("GIF89a-stand-in");
// 3 frames of 64x32: 100 ms, 0 ms (so 100 ms), 50 ms.
const DURATIONS_US = [100_000, 0, 50_000];

interface FakeFrame {
	index: number;
	displayWidth: number;
	displayHeight: number;
	duration: number;
	close(): void;
}
interface FakeBitmap {
	index: number;
	width: number;
	height: number;
	close(): void;
}

let decodes: number[] = [];
let decoderTypes: string[] = [];
let draws: Array<{ canvas: HTMLCanvasElement; op: string; args: unknown[] }> = [];
let failDecode = false;

class FakeImageDecoder {
	static isTypeSupported = async (type: string) =>
		["image/gif", "image/png", "image/webp", "image/avif"].includes(type);
	readonly tracks = {
		ready: Promise.resolve(),
		selectedTrack: { frameCount: DURATIONS_US.length, animated: true },
	};
	closed = false;
	constructor(init: { data: ArrayBuffer; type: string }) {
		decoderTypes.push(init.type);
		if (failDecode) {
			this.tracks.ready = Promise.reject(
				new DOMException("Failed to retrieve track metadata.", "InvalidStateError"),
			);
			this.tracks.ready.catch(() => {});
		}
	}
	async decode({ frameIndex }: { frameIndex: number }): Promise<{ image: FakeFrame }> {
		decodes.push(frameIndex);
		return {
			image: {
				index: frameIndex,
				displayWidth: 64,
				displayHeight: 32,
				duration: DURATIONS_US[frameIndex] as number,
				close() {},
			},
		};
	}
	close() {
		this.closed = true;
	}
}

const settle = () =>
	act(async () => {
		for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
	});

const handles = () => readiness.openHandles().map((h) => h.label);

beforeEach(() => {
	decodes = [];
	decoderTypes = [];
	draws = [];
	failDecode = false;
	vi.stubGlobal("ImageDecoder", FakeImageDecoder);
	vi.stubGlobal("createImageBitmap", async (frame: FakeFrame): Promise<FakeBitmap> => {
		const bitmap = {
			index: frame.index,
			width: frame.displayWidth,
			height: frame.displayHeight,
			close() {
				bitmap.width = 0;
			},
		};
		return bitmap;
	});
	vi.stubGlobal("fetch", async (url: string) => {
		if (url.includes("missing")) {
			return new Response("Not Found", { status: 404, statusText: "Not Found" });
		}
		// Served with a generic type: the format comes from the bytes.
		const type = url.includes("generic") ? "application/octet-stream" : "image/gif";
		return new Response(GIF_BYTES, { headers: { "content-type": type } });
	});
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
		this: HTMLCanvasElement,
	) {
		const record =
			(canvas: HTMLCanvasElement, op: string) =>
			(...args: unknown[]) =>
				draws.push({ canvas, op, args });
		return {
			clearRect: record(this, "clearRect"),
			drawImage: record(this, "drawImage"),
		} as unknown as CanvasRenderingContext2D;
	} as never);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	readiness.reset();
});

/** The frame index of the last image drawn, or "clear" when the last operation cleared. */
const lastDrawn = () => {
	const last = draws.at(-1);
	if (!last) return undefined;
	if (last.op === "clearRect") return "clear";
	return (last.args[0] as FakeBitmap).index;
};

describe("AnimatedImage", () => {
	it("holds readiness until loaded and drawn, then draws the frame of each time", async () => {
		const view = renderAtFrame(<AnimatedImage src="/a.gif" />, 0);
		expect(handles()).toEqual(["Loading <AnimatedImage> with src=/a.gif"]);
		await settle();
		expect(handles()).toEqual([]);
		// Every frame is decoded once at load, to learn the durations.
		expect(decodes).toEqual([0, 1, 2]);
		expect(decoderTypes).toEqual(["image/gif"]);
		expect(lastDrawn()).toBe(0);
		// 30 fps: frame 3 is 100 ms, the start of frame 1 (0 ms long, so shown 100 ms).
		view.at(2);
		expect(lastDrawn()).toBe(0);
		view.at(3);
		expect(lastDrawn()).toBe(1);
		view.at(5);
		expect(lastDrawn()).toBe(1);
		view.at(6);
		expect(lastDrawn()).toBe(2);
		// One play is 250 ms: frame 8 (266.7 ms) loops to frame 0.
		view.at(8);
		expect(lastDrawn()).toBe(0);
		expect(handles()).toEqual([]);
		view.unmount();
	});

	it("sizes the canvas from the image, or from width and height", async () => {
		const view = renderAtFrame(<AnimatedImage src="/a.gif" />, 0);
		expect(view.container.innerHTML).toBe("<canvas></canvas>");
		await settle();
		expect(view.container.innerHTML).toBe('<canvas width="64" height="32"></canvas>');
		view.unmount();
		const sized = renderAtFrame(<AnimatedImage src="/a.gif" width={120} />, 0);
		expect(sized.container.innerHTML).toBe('<canvas width="120"></canvas>');
		await settle();
		expect(sized.container.innerHTML).toBe('<canvas width="120" height="32"></canvas>');
		sized.unmount();
	});

	it("passes canvas attributes and style through and forwards the ref", async () => {
		const ref = createRef<HTMLCanvasElement>();
		const view = renderAtFrame(
			<AnimatedImage
				src="/a.gif"
				width={80}
				height={60}
				className="a"
				id="b"
				style={{ opacity: 0.5 }}
				ref={ref}
			/>,
			0,
		);
		await settle();
		expect(view.container.innerHTML).toBe(
			'<canvas class="a" id="b" width="80" height="60" style="opacity: 0.5;"></canvas>',
		);
		expect(ref.current?.tagName).toBe("CANVAS");
		view.unmount();
	});

	it("draws with the fit mode", async () => {
		const view = renderAtFrame(
			<AnimatedImage src="/a.gif" width={200} height={200} fit="contain" />,
			0,
		);
		await settle();
		expect(draws.at(-1)?.args.slice(1)).toEqual([0, 50, 200, 100]);
		view.unmount();
		expect(animatedImageFitRect("cover", 64, 32, 200, 200)).toEqual({
			x: -100,
			y: 0,
			width: 400,
			height: 200,
		});
		expect(animatedImageFitRect("fill", 64, 32, 200, 100)).toEqual({
			x: 0,
			y: 0,
			width: 200,
			height: 100,
		});
		// Unknown modes are tolerated and fill.
		expect(animatedImageFitRect("nope", 64, 32, 10, 20)).toEqual({
			x: 0,
			y: 0,
			width: 10,
			height: 20,
		});
	});

	it("applies playbackRate and the Sequence timing props", async () => {
		const view = renderAtFrame(
			<AnimatedImage src="/a.gif" from={10} trimBefore={3} playbackRate={2} />,
			0,
		);
		expect(view.container.innerHTML).toBe("");
		view.at(10);
		await settle();
		// Local frame 3 at 30 fps: 100 ms, frame 1.
		expect(lastDrawn()).toBe(1);
		// Two frames later at double speed: local frame 7 (233 ms), frame 2.
		view.at(12);
		expect(lastDrawn()).toBe(2);
		view.unmount();
	});

	it("pause-after-finish holds the last frame; clear-after-finish clears the canvas", async () => {
		const paused = renderAtFrame(
			<AnimatedImage src="/a.gif" loopBehavior="pause-after-finish" />,
			0,
		);
		await settle();
		paused.at(30);
		expect(lastDrawn()).toBe(2);
		paused.unmount();
		const cleared = renderAtFrame(
			<AnimatedImage src="/a.gif" loopBehavior="clear-after-finish" />,
			0,
		);
		await settle();
		cleared.at(7);
		expect(lastDrawn()).toBe(2);
		// 250 ms is the end of the play: cleared from there, the canvas stays.
		cleared.at(Math.ceil(0.25 * 30));
		expect(lastDrawn()).toBe("clear");
		expect(cleared.container.querySelector("canvas")).not.toBeNull();
		cleared.unmount();
	});

	it("recognises the format from the bytes when the server sends a generic type", async () => {
		const view = renderAtFrame(<AnimatedImage src="/generic.gif" />, 0);
		await settle();
		expect(decoderTypes).toEqual(["image/gif"]);
		expect(lastDrawn()).toBe(0);
		view.unmount();
	});

	it("calls onError with an Error naming the file and keeps the canvas", async () => {
		const errors: Error[] = [];
		const view = renderAtFrame(
			<AnimatedImage src="/missing.gif" onError={(e) => errors.push(e)} />,
			0,
		);
		await settle();
		expect(errors).toHaveLength(1);
		expect(errors[0]).toBeInstanceOf(Error);
		expect(errors[0]?.message).toBe(
			"<AnimatedImage> could not load /missing.gif: the server answered HTTP 404 Not Found",
		);
		expect(handles()).toEqual([]);
		expect(view.container.innerHTML).toBe("<canvas></canvas>");
		view.unmount();
	});

	it("keeps the decoder's error as the cause", async () => {
		failDecode = true;
		const errors: Error[] = [];
		const view = renderAtFrame(<AnimatedImage src="/bad.gif" onError={(e) => errors.push(e)} />, 0);
		await settle();
		expect((errors[0]?.cause as DOMException | undefined)?.name).toBe("InvalidStateError");
		view.unmount();
	});

	it("fails the render without onError, like <Gif>", async () => {
		const failures: unknown[] = [];
		const onError = (event: ErrorEvent) => {
			failures.push(event.error);
			event.preventDefault();
		};
		window.addEventListener("error", onError);
		vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const view = renderAtFrame(<AnimatedImage src="/missing.gif" />, 0);
			try {
				await settle();
			} catch (error) {
				failures.push(error);
			}
			view.unmount();
		} finally {
			window.removeEventListener("error", onError);
		}
		const messages = failures.map((e) => (e as Error).message);
		expect(messages.some((m) => /\/missing\.gif.*HTTP 404.*onError/.test(m))).toBe(true);
	});

	it("says what to do in a browser without ImageDecoder", async () => {
		vi.stubGlobal("ImageDecoder", undefined);
		const errors: Error[] = [];
		const view = renderAtFrame(<AnimatedImage src="/a.gif" onError={(e) => errors.push(e)} />, 0);
		await settle();
		expect(errors[0]?.message).toMatch(/ImageDecoder.*Chrome or Firefox.*<Gif>/);
		view.unmount();
	});

	it("rejects an invalid playbackRate with a TypeError and an effects list", () => {
		for (const playbackRate of [-1, 0, Number.NaN]) {
			expect(() =>
				renderAtFrame(<AnimatedImage src="/a.gif" playbackRate={playbackRate} />, 0),
			).toThrow(TypeError);
		}
		expect(() => renderAtFrame(<AnimatedImage src="/a.gif" effects={[{}]} />, 0)).toThrow(
			/effects/,
		);
	});

	it("hides the canvas while premounted, over the default with styleWhilePremounted", async () => {
		const view = renderAtFrame(
			<AnimatedImage
				src="/a.gif"
				from={10}
				premountFor={5}
				width={10}
				height={10}
				styleWhilePremounted={{ opacity: 0.2 }}
			/>,
			6,
		);
		await settle();
		expect(view.container.innerHTML).toBe(
			'<canvas width="10" height="10" style="display: none; pointer-events: none; opacity: 0.2;"></canvas>',
		);
		view.unmount();
	});
});

describe("acquireAnimatedImage", () => {
	it("shares one decode between users and frees it with the last", async () => {
		const first = acquireAnimatedImage("/shared.gif");
		const second = acquireAnimatedImage("/shared.gif");
		const [a, b] = await Promise.all([first.promise, second.promise]);
		expect(a).toBe(b);
		expect(decoderTypes).toHaveLength(1);
		first.release();
		expect(a.frame(0)).not.toBeNull();
		second.release();
		expect(a.frame(0)).toBeNull();
	});

	it("keeps frames up to the budget and decodes the others again on demand", async () => {
		// Room for one 64x32 RGBA frame.
		const { promise, release } = acquireAnimatedImage("/budget.gif", {}, 64 * 32 * 4);
		const image = await promise;
		expect([image.frame(0), image.frame(1), image.frame(2)].map((f) => f !== null)).toEqual([
			true,
			false,
			false,
		]);
		expect(image.timeline.durations).toEqual([100_000, 100_000, 50_000]);
		decodes = [];
		const bitmap = await image.load(2);
		expect((bitmap as unknown as FakeBitmap).index).toBe(2);
		expect(decodes).toEqual([2]);
		// Frame 0 was evicted (and closed) to make room.
		expect(image.frame(0)).toBeNull();
		await expect(image.load(3)).rejects.toThrow(RangeError);
		release();
	});
});

describe("sniffImageType", () => {
	const bytes = (...parts: Array<string | number[]>) =>
		new Uint8Array(
			parts.flatMap((p) => (typeof p === "string" ? [...new TextEncoder().encode(p)] : p)),
		);
	it("recognises GIF, PNG, WebP, AVIF and JPEG", () => {
		expect(sniffImageType(bytes("GIF87a"))).toBe("image/gif");
		expect(sniffImageType(bytes("GIF89a"))).toBe("image/gif");
		expect(sniffImageType(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
		expect(sniffImageType(bytes("RIFF", [1, 2, 3, 4], "WEBPVP8L"))).toBe("image/webp");
		expect(sniffImageType(bytes([0, 0, 0, 20], "ftypavis", [0, 0, 0, 0], "avifmif1"))).toBe(
			"image/avif",
		);
		expect(sniffImageType(bytes([0, 0, 0, 24], "ftypmif1", [0, 0, 0, 0], "mif1avif"))).toBe(
			"image/avif",
		);
		expect(sniffImageType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
	});
	it("returns null for anything else", () => {
		expect(sniffImageType(bytes("not an image"))).toBeNull();
		expect(sniffImageType(bytes([0, 0, 0, 16], "ftypisom", [0, 0, 0, 0]))).toBeNull();
		expect(sniffImageType(new Uint8Array())).toBeNull();
	});
});
