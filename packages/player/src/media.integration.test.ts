// A Video and an Audio inside the Player, in the pinned chrome-headless-shell on the real clock:
// the native elements play in sync with the Player's frame, follow pause and seek, and apply
// the Player's volume, mute and playback rate.
import { createReadStream, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testChromeArgs } from "../../testing/src/browser.js";

const chrome =
	process.env.MOTIO_BROWSER_EXECUTABLE ??
	resolve(
		process.env.HOME ?? "",
		".cache/motio/browsers/chrome-headless-shell/mac_arm-158.0.8127.36/chrome-headless-shell-mac-arm64/chrome-headless-shell",
	);
const MEDIA = resolve(import.meta.dirname, "../../../fixtures/media/public");

interface ElementState {
	currentTime: number;
	paused: boolean;
	volume: number;
	muted: boolean;
	inDocument: boolean;
}

let server: Server;
let browser: Browser;
let page: Page;

/** Serves the test page and the fixture media, with single byte ranges (media seeking needs them). */
function serve(html: string): Server {
	return createServer((req, res) => {
		const name = (req.url ?? "/").split("?")[0] ?? "/";
		if (name === "/") {
			res.writeHead(200, { "content-type": "text/html" }).end(html);
			return;
		}
		const file = join(MEDIA, name.replace(/^\/+/, ""));
		let size: number;
		try {
			size = statSync(file).size;
		} catch {
			res.writeHead(404).end();
			return;
		}
		const type = file.endsWith(".mp4") ? "video/mp4" : "audio/wav";
		const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
		if (!m) {
			res.writeHead(200, {
				"content-type": type,
				"content-length": size,
				"accept-ranges": "bytes",
			});
			createReadStream(file).pipe(res);
			return;
		}
		const start = Number(m[1]);
		const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
		res.writeHead(206, {
			"content-type": type,
			"content-length": end - start + 1,
			"content-range": `bytes ${start}-${end}/${size}`,
			"accept-ranges": "bytes",
		});
		createReadStream(file, { start, end }).pipe(res);
	}).listen(0);
}

beforeAll(async () => {
	const out = await build({
		entryPoints: [join(import.meta.dirname, "test-support/media-entry.tsx")],
		bundle: true,
		write: false,
		format: "iife",
		platform: "browser",
		jsx: "automatic",
		define: { "process.env.NODE_ENV": '"production"' },
	});
	const js = out.outputFiles[0]?.text ?? "";
	server = serve(
		`<!doctype html><html><head><meta charset="utf-8"></head><body><script>${js}</script></body></html>`,
	);
	const port = (server.address() as { port: number }).port;
	browser = await puppeteer.launch({
		executablePath: chrome,
		headless: true,
		args: testChromeArgs(["--autoplay-policy=no-user-gesture-required"]),
	});
	page = await browser.newPage();
	await page.goto(`http://127.0.0.1:${port}/`);
	await page.waitForSelector("body[data-ready=true]");
	expect(readFileSync(join(MEDIA, "stamp-30.mp4")).length).toBeGreaterThan(0);
});

afterAll(async () => {
	await browser?.close();
	server?.close();
});

const call = <T>(fn: string, ...args: unknown[]): Promise<T> =>
	page.evaluate(
		(f, a) => {
			const api = (
				window as unknown as { __mediaTest: Record<string, (...x: unknown[]) => unknown> }
			).__mediaTest;
			return (api[f] as (...x: unknown[]) => unknown)(...a);
		},
		fn,
		args,
	) as Promise<T>;

const player = (method: string, ...args: unknown[]) =>
	page.evaluate(
		(m, a) => {
			const p = (
				window as unknown as {
					__mediaTest: { player: () => Record<string, (...x: unknown[]) => unknown> };
				}
			).__mediaTest.player();
			return (p[m] as (...x: unknown[]) => unknown)(...a);
		},
		method,
		args,
	);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("media in the Player", () => {
	it("plays the video on the real clock in sync with the Player's frame", async () => {
		await call("mount");
		await player("play");
		await sleep(500);
		const samples: { t: number; frame: number; video: ElementState }[] = [];
		for (let i = 0; i < 8; i++) {
			const [frame, video] = await Promise.all([
				call<number>("frame"),
				call<ElementState>("video"),
			]);
			samples.push({ t: performance.now(), frame, video });
			await sleep(150);
		}
		for (const s of samples) {
			expect(s.video.paused).toBe(false);
			// Within the default acceptableTimeShiftInSeconds (0.45 s), and in practice much closer.
			expect(Math.abs(s.video.currentTime - s.frame / 30)).toBeLessThan(0.2);
		}
		const first = samples[0] as (typeof samples)[number];
		const last = samples.at(-1) as (typeof samples)[number];
		const rate = (last.video.currentTime - first.video.currentTime) / ((last.t - first.t) / 1000);
		console.log(
			`video advanced at ${rate.toFixed(3)}x real time; max drift ${Math.max(...samples.map((s) => Math.abs(s.video.currentTime - s.frame / 30))).toFixed(3)} s`,
		);
		expect(rate).toBeGreaterThan(0.85);
		expect(rate).toBeLessThan(1.15);
	});

	it("pauses with the Player and seeks to the frame", async () => {
		await player("pause");
		await player("seekTo", 60);
		await sleep(300);
		const video = await call<ElementState>("video");
		expect(video.paused).toBe(true);
		expect(video.currentTime).toBeCloseTo(2, 2);
	});

	it("applies the Player's volume and mute on top of the component's volume", async () => {
		await player("setVolume", 0.5);
		await sleep(50);
		expect((await call<ElementState>("video")).volume).toBeCloseTo(0.25, 5);
		expect((await call<ElementState>("audio")).volume).toBeCloseTo(0.5, 5);
		await player("mute");
		await sleep(50);
		expect((await call<ElementState>("video")).muted).toBe(true);
		expect((await call<ElementState>("audio")).muted).toBe(true);
		await player("unmute");
		await player("setVolume", 1);
		await sleep(50);
		const video = await call<ElementState>("video");
		expect(video.muted).toBe(false);
		expect(video.volume).toBeCloseTo(0.5, 5);
	});

	it("plays the audio from a shared audio tag, outside the composition's DOM", async () => {
		await player("seekTo", 0);
		await player("play");
		await sleep(400);
		const audio = await call<ElementState & { src: string }>("audio");
		expect(audio.inDocument).toBe(false);
		expect(audio.src).toBe("/clicks.wav");
		expect(audio.paused).toBe(false);
		expect(Math.abs(audio.currentTime - (await call<number>("frame")) / 30)).toBeLessThan(0.2);
		await player("pause");
	});

	it("applies the Player's playback rate", async () => {
		await call("mount", { playbackRate: 2 });
		await player("seekTo", 0);
		await player("play");
		await sleep(400);
		const video = await call<ElementState & { playbackRate: number }>("video");
		expect(video.playbackRate).toBe(2);
		expect(Math.abs(video.currentTime - (await call<number>("frame")) / 30)).toBeLessThan(0.3);
		await player("pause");
	});
});
