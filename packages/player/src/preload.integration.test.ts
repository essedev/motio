// @motiojs/preload with the Player, in the pinned chrome-headless-shell, on a slow server: a
// video or audio that mounts during playback (inside a Sequence, with pauseWhenBuffering) holds
// the Player while it loads, unless it was preloaded, in which case it plays on without a stall
// and without downloading the file again. Chrome shares a media element's buffered data with the
// other media elements of the page that play the same file, so the Player needs no code of its
// own for this; these tests guard that it works through the Player's media components and its
// shared audio tags.
import { readFileSync } from "node:fs";
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
/** Each file takes about this long to download in full. */
const DOWNLOAD_MS = 3000;

let server: Server;
let browser: Browser;
let page: Page;
/** Body bytes sent per path (query included). */
const sent = new Map<string, number>();

/** Serves the page and the fixture media, slowly, with single byte ranges. */
function serve(html: string): Server {
	return createServer(async (req, res) => {
		const url = req.url ?? "/";
		if (url === "/") {
			res.writeHead(200, { "content-type": "text/html" }).end(html);
			return;
		}
		const name = url.split("?")[0]?.slice(1) ?? "";
		let body: Buffer;
		try {
			body = readFileSync(join(MEDIA, name));
		} catch {
			res.writeHead(404).end();
			return;
		}
		const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
		const start = m ? Number(m[1]) : 0;
		const end = m?.[2] ? Math.min(Number(m[2]), body.length - 1) : body.length - 1;
		res.writeHead(m ? 206 : 200, {
			"content-type": name.endsWith(".mp4") ? "video/mp4" : "audio/wav",
			"content-length": end - start + 1,
			"accept-ranges": "bytes",
			"cache-control": "no-store",
			...(m ? { "content-range": `bytes ${start}-${end}/${body.length}` } : {}),
		});
		const chunk = Math.max(1, Math.ceil(body.length / (DOWNLOAD_MS / 50)));
		let closed = false;
		res.on("close", () => {
			closed = true;
		});
		for (let at = start; at <= end && !closed; at += chunk) {
			const part = body.subarray(at, Math.min(at + chunk, end + 1));
			res.write(part);
			sent.set(url, (sent.get(url) ?? 0) + part.length);
			await new Promise((r) => setTimeout(r, 50));
		}
		res.end();
	}).listen(0);
}

beforeAll(async () => {
	const out = await build({
		entryPoints: [join(import.meta.dirname, "test-support/preload-entry.tsx")],
		bundle: true,
		write: false,
		format: "iife",
		platform: "browser",
		jsx: "automatic",
		define: { "process.env.NODE_ENV": '"production"' },
	});
	server = serve(
		`<!doctype html><html><head><meta charset="utf-8"></head><body><script>${out.outputFiles[0]?.text ?? ""}</script></body></html>`,
	);
	browser = await puppeteer.launch({
		executablePath: chrome,
		headless: true,
		args: testChromeArgs(["--autoplay-policy=no-user-gesture-required"]),
	});
	page = await browser.newPage();
	await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
	await page.waitForSelector("body[data-ready=true]");
});

afterAll(async () => {
	await browser?.close();
	server?.close();
});

type Played = { longestStillMs: number; waiting: number; elapsedMs: number; frame: number };
const call = <T>(fn: string, ...args: unknown[]): Promise<T> =>
	page.evaluate(
		(f, a) =>
			(
				window as unknown as { __preloadTest: Record<string, (...x: unknown[]) => unknown> }
			).__preloadTest[f]?.(...a),
		fn,
		args,
	) as Promise<T>;

/** Mounts a Player with the media at `src` (preloaded first if asked) and plays 2 s of it. */
async function scenario(kind: "video" | "audio", src: string, preloaded: boolean) {
	if (preloaded) await call("preload", kind, src);
	await call("mount", kind, src);
	const played = await call<Played>("play", 60, DOWNLOAD_MS * 3);
	await call("unmount");
	const size = readFileSync(join(MEDIA, src.slice(1).split("?")[0] as string)).length;
	// Bytes sent for the URL by the preload and the Player together, per byte of the file: 1 when
	// the Player reused what the preload downloaded.
	return { ...played, downloads: (sent.get(src) ?? 0) / size };
}

describe("preloaded media in the Player", () => {
	it("a video that mounts during playback stalls the Player when it was not preloaded", async () => {
		const got = await scenario("video", "/stamp-30.mp4?case=cold", false);
		console.log(`video, not preloaded: ${JSON.stringify(got)}`);
		expect(got.waiting).toBeGreaterThan(0);
		expect(got.longestStillMs).toBeGreaterThan(500);
	});

	it("a preloaded video plays on without a stall and without a new download", async () => {
		const got = await scenario("video", "/stamp-30.mp4?case=warm", true);
		console.log(`video, preloaded: ${JSON.stringify(got)}`);
		expect(got.frame).toBeGreaterThanOrEqual(60);
		// Under the Player's default bufferStateDelayInMilliseconds (300): no spinner, no visible hold.
		expect(got.longestStillMs).toBeLessThan(200);
		expect(got.downloads).toBeLessThan(1.05);
		// 45 frames at 30 fps after the media mounts: about 2 s in all.
		expect(got.elapsedMs).toBeLessThan(2500);
	});

	it("a preloaded audio file plays on through the Player's shared audio tags", async () => {
		const cold = await scenario("audio", "/tone.wav?case=cold", false);
		const warm = await scenario("audio", "/tone.wav?case=warm", true);
		// After a buffering pause the Player's clock waits for the audio output to start again
		// (MediaStartGate), which takes the output device's latency on top of any stall.
		const latency = await call<number>("audioStartLatency");
		console.log(
			`audio, not preloaded: ${JSON.stringify(cold)}; preloaded: ${JSON.stringify(warm)}; audio start latency ${latency.toFixed(0)} ms`,
		);
		expect(warm.longestStillMs).toBeLessThan(200 + latency);
		expect(warm.downloads).toBeLessThan(1.05);
		expect(warm.frame).toBeGreaterThanOrEqual(60);
	});
});
