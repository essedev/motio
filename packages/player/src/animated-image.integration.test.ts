// <AnimatedImage> in the pinned chrome-headless-shell, through the Player package:
// - in a Thumbnail at chosen frames, for every case recorded from Remotion
//   (fixtures/animated-image/__golden__/remotion): the frame shown equals Motio's timing rule
//   (D-066), and the canvas markup and the failures compare with the recording;
// - in a playing Player on the real clock: every sample shows the image frame of the frame the
//   composition rendered.
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	animatedImageFrameAt,
	animatedImageTimeAt,
	animatedImageTimeline,
} from "../../core/src/media/animated-image-timing.js";
import { testChromeArgs } from "../../testing/src/browser.js";

const chrome =
	process.env.MOTIO_BROWSER_EXECUTABLE ??
	resolve(
		process.env.HOME ?? "",
		".cache/motio/browsers/chrome-headless-shell/mac_arm-158.0.8127.36/chrome-headless-shell-mac-arm64/chrome-headless-shell",
	);
const FIXTURE = resolve(import.meta.dirname, "../../../fixtures/animated-image");
const description = JSON.parse(readFileSync(join(FIXTURE, "frames.json"), "utf8")) as {
	colors: number[][];
	durationsMs: number[];
};
interface Recorded {
	timing: Array<{
		src: string;
		fps: number;
		props: Record<string, unknown>;
		lastFrame: number;
		frames: Array<number | string | null>;
	}>;
	markup: Array<{
		src: string;
		props: Record<string, unknown>;
		html: string;
		bitmap: [number, number];
		layout: [number, number];
		centre: number | string | null;
	}>;
	invalid: Array<{
		src: string;
		props: Record<string, unknown>;
		error: string | null;
		onError: string | null;
		canvas: boolean;
	}>;
}
const oracle = JSON.parse(
	readFileSync(join(FIXTURE, "__golden__/remotion/animated-image.json"), "utf8"),
) as Recorded;
const TYPES: Record<string, string> = {
	gif: "image/gif",
	png: "image/png",
	webp: "image/webp",
	avif: "image/avif",
};
const SHORT_DELAYS_MS = [0, 10, 20, 100];

let server: Server;
let browser: Browser;
let page: Page;

const call = <T>(fn: string, ...args: unknown[]): Promise<T> =>
	page.evaluate(
		(f, a) =>
			(
				window as unknown as { __animatedImageTest: Record<string, (...x: unknown[]) => unknown> }
			).__animatedImageTest[f]?.(...a),
		fn,
		args,
	) as Promise<T>;

/** The image frame Motio shows at a composition frame, following the Sequence timing props. */
function expectedFrame(
	src: string,
	fps: number,
	props: Record<string, unknown>,
	frame: number,
): number | "clear" | null {
	const from = (props.from as number | undefined) ?? 0;
	if (frame < from) return null;
	const rate = (props.playbackRate as number | undefined) ?? 1;
	const local = (frame - from) * rate + ((props.trimBefore as number | undefined) ?? 0);
	const durations = (src.includes("short-delays") ? SHORT_DELAYS_MS : description.durationsMs).map(
		(ms) => ms * 1000,
	);
	const index = animatedImageFrameAt(
		animatedImageTimeline(durations),
		animatedImageTimeAt(local, fps),
		(props.loopBehavior as string | undefined) ?? "loop",
	);
	return index === null ? "clear" : index;
}

/** The attributes of the recorded or rendered canvas tag, ignoring their order. */
function canvasAttributes(html: string): Record<string, string> {
	const tag = /<canvas([^>]*)>/.exec(html)?.[1] ?? "";
	return Object.fromEntries([...tag.matchAll(/(\S+?)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
}

beforeAll(async () => {
	const out = await build({
		entryPoints: [join(import.meta.dirname, "test-support/animated-image-player-entry.tsx")],
		bundle: true,
		write: false,
		format: "iife",
		platform: "browser",
		jsx: "automatic",
		define: { "process.env.NODE_ENV": '"production"' },
	});
	const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><script>${out.outputFiles[0]?.text ?? ""}</script></body></html>`;
	server = createServer((req, res) => {
		const path = new URL(req.url ?? "/", "http://localhost").pathname;
		if (path === "/") {
			res.writeHead(200, { "content-type": "text/html" }).end(html);
			return;
		}
		if (path === "/not-an-image.gif") {
			res.writeHead(200, { "content-type": "image/gif" }).end("not an image");
			return;
		}
		try {
			const body = readFileSync(join(FIXTURE, "public", path.slice(1)));
			res.writeHead(200, { "content-type": TYPES[path.split(".").pop() ?? ""] ?? "" }).end(body);
		} catch {
			res.writeHead(404, { "content-type": "text/plain" }).end("Not Found");
		}
	}).listen(0);
	browser = await puppeteer.launch({
		executablePath: chrome,
		headless: true,
		args: testChromeArgs(),
	});
	page = await browser.newPage();
	await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
	await page.waitForSelector("body[data-ready=true]");
	await call("setColors", description.colors);
});

afterAll(async () => {
	await browser?.close();
	server?.close();
});

describe("AnimatedImage in a Thumbnail, over the recorded cases", () => {
	it("shows the frame of Motio's timing rule at every composition frame", async () => {
		const mismatches: string[] = [];
		let compared = 0;
		for (const c of oracle.timing) {
			const got = await call<Array<number | string | null>>(
				"timing",
				c.src,
				c.fps,
				c.props,
				c.lastFrame,
			);
			got.forEach((value, frame) => {
				compared++;
				const want = expectedFrame(c.src, c.fps, c.props, frame);
				if (value !== want) {
					mismatches.push(`${c.src} ${JSON.stringify(c.props)} @${c.fps} frame ${frame}: ${value}`);
				}
			});
		}
		console.log(`AnimatedImage timing: ${compared} frames over ${oracle.timing.length} cases`);
		expect(mismatches).toEqual([]);
	}, 300_000);

	it("sizes and styles the canvas as recorded", async () => {
		for (const c of oracle.markup) {
			const got = await call<{
				html: string;
				bitmap: [number, number];
				layout: [number, number];
				centre: number | string | null;
			}>("markup", c.src, c.props);
			const label = JSON.stringify(c.props);
			expect(got.bitmap, label).toEqual(c.bitmap);
			expect(got.layout, label).toEqual(c.layout);
			expect(got.centre, label).toBe(c.centre);
			expect(canvasAttributes(got.html), label).toEqual(canvasAttributes(c.html));
		}
	}, 120_000);

	it("fails, tolerates and reports errors as recorded, except the deliberate differences", async () => {
		for (const c of oracle.invalid) {
			const got = await call<{
				error: { name: string; message: string; cause: string | null } | null;
				onError: { name: string; message: string; cause: string | null } | null;
				canvas: boolean;
			}>("invalid", c.src, c.props);
			const label = `${c.src} ${JSON.stringify(c.props)}`;
			if (c.error !== null) {
				// Invalid playbackRate: the same class, naming the same prop.
				const [name] = c.error.split(":");
				expect(got.error?.name, label).toBe(name);
				expect(got.error?.message, label).toMatch(/playbackRate/);
				expect(got.canvas, label).toBe(c.canvas);
			} else if (c.onError !== null) {
				// onError gets an Error naming the file, with the browser's error as its cause when the
				// decoder failed (Remotion passes that DOMException itself), and an HTTP failure as such.
				expect(got.error, label).toBeNull();
				expect(got.onError?.name, label).toBe("Error");
				expect(got.onError?.message, label).toContain(c.src);
				if (c.src === "/missing.gif") expect(got.onError?.message, label).toMatch(/HTTP 404/);
				else expect(got.onError?.cause, label).toBe(c.onError);
				expect(got.canvas, label).toBe(c.canvas);
			} else if (c.src === "/missing.gif") {
				// Deliberate difference: without onError a failed load fails the render, like <Gif>;
				// Remotion leaves an empty canvas.
				expect(got.error?.message, label).toMatch(/\/missing\.gif.*HTTP 404.*onError/);
			} else {
				// Unknown loopBehavior and fit values are tolerated, as recorded.
				expect(got.error, label).toBeNull();
				expect(got.canvas, label).toBe(true);
			}
		}
	}, 120_000);
});

describe("AnimatedImage in a playing Player", () => {
	it("shows the image frame of the rendered frame in every sample, on the real clock", async () => {
		const samples = await call<Array<{ frame: number; shown: number | string | null }>>(
			"play",
			"/frames.gif",
			30,
			2500,
		);
		const wrong = samples.filter((s) => s.shown !== expectedFrame("/frames.gif", 30, {}, s.frame));
		const frames = new Set(samples.map((s) => s.frame));
		const images = new Set(samples.map((s) => s.shown));
		console.log(
			`AnimatedImage in the Player: ${samples.length} samples over ${frames.size} frames, ${wrong.length} wrong`,
		);
		expect(wrong).toEqual([]);
		// About 2.5 s at 30 fps: most frames were sampled and every image frame was seen.
		expect(frames.size).toBeGreaterThan(50);
		expect([...images].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
	}, 60_000);
});
