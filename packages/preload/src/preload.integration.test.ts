// @motiojs/preload in the pinned chrome-headless-shell, against the recordings of the published
// @remotion/preload (tools/oracle-render/record-preload.ts) on the same two-origin server:
// resolveRedirect() gives the same results; each function adds the same kind of element in the
// same place. Motio's deliberate differences are asserted too: media and images are preloaded
// from the URL as given (no fetch first, so no CORS needed and no extra download), a font preload
// is reused by @font-face, and calls for one URL share one element.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Logged, startPreloadServers } from "../../../fixtures/preload/server.js";
import { testChromeArgs } from "../../testing/src/browser.js";

const require = createRequire(import.meta.url);
const oracle = require("./__oracle__/preload.json") as {
	cases: { fn: string; url: string; added: { parent: string; html: string }[] }[];
	redirects: { url: string; resolved?: string; errorClass?: string }[];
};
const chrome =
	process.env.MOTIO_BROWSER_EXECUTABLE ??
	resolve(
		process.env.HOME ?? "",
		".cache/motio/browsers/chrome-headless-shell/mac_arm-158.0.8127.36/chrome-headless-shell-mac-arm64/chrome-headless-shell",
	);

let servers: Awaited<ReturnType<typeof startPreloadServers>>;
let browser: Browser;
let page: Page;
const fill = (s: string) => s.replaceAll("{A}", servers.originA).replaceAll("{B}", servers.originB);

type Outcome = {
	added: {
		parent: string;
		tag: string;
		src: string | null;
		as: string | null;
		crossOrigin: string | null;
	}[];
	ready: boolean;
	error: string | null;
	left: number;
};

beforeAll(async () => {
	const out = await build({
		stdin: {
			contents: `import * as P from "./index.ts"; window.P = P;`,
			resolveDir: import.meta.dirname,
			loader: "ts",
		},
		bundle: true,
		write: false,
		format: "iife",
		platform: "browser",
	});
	servers = await startPreloadServers(
		`<!doctype html><html><head></head><body><script>${out.outputFiles[0]?.text ?? ""}</script></body></html>`,
	);
	browser = await puppeteer.launch({
		executablePath: chrome,
		headless: true,
		args: testChromeArgs(),
	});
	page = await browser.newPage();
	await page.goto(`${servers.originA}/`);
});

afterAll(async () => {
	await browser?.close();
	servers?.close();
});

/** Calls `fn(url)`, waits for onReady or onError (at most `waitMs`), frees, reports. */
const run = (fn: string, url: string, waitMs = 3000): Promise<Outcome> =>
	page.evaluate(
		async (fn, url, waitMs) => {
			const P = (window as unknown as { P: Record<string, (u: string, o: object) => () => void> })
				.P;
			const nodes = () =>
				[...document.head.children, ...document.body.children].filter(
					(e) => e.tagName !== "SCRIPT",
				);
			const before = nodes().length;
			let ready = false;
			let error: string | null = null;
			let free: () => void = () => undefined;
			await new Promise<void>((done) => {
				const timer = setTimeout(done, waitMs);
				free = (P[fn] as (u: string, o: object) => () => void)(url, {
					onReady: () => {
						ready = true;
						clearTimeout(timer);
						done();
					},
					onError: (e: Error) => {
						error = e.message;
						clearTimeout(timer);
						done();
					},
				});
			});
			const added = nodes()
				.slice(before)
				.map((e) => ({
					parent: e.parentElement === document.head ? "head" : "body",
					tag: e.tagName.toLowerCase(),
					src: e.getAttribute("src") ?? e.getAttribute("href"),
					as: e.getAttribute("as"),
					crossOrigin: e.getAttribute("crossorigin"),
				}));
			free();
			return { added, ready, error, left: nodes().length - before };
		},
		fn,
		url,
		waitMs,
	);

const requestsDuring = async (action: () => Promise<unknown>): Promise<Logged[]> => {
	const start = servers.log.length;
	await action();
	return servers.log.slice(start);
};

describe("resolveRedirect() against the oracle", () => {
	it(`gives the same result for all ${oracle.redirects.length} recorded URLs`, async () => {
		for (const c of oracle.redirects) {
			const got = await page.evaluate(async (url) => {
				const P = (window as unknown as { P: { resolveRedirect: (u: string) => Promise<string> } })
					.P;
				try {
					return { resolved: await P.resolveRedirect(url) };
				} catch (e) {
					return { errorClass: e instanceof TypeError ? "TypeError" : "other" };
				}
			}, fill(c.url));
			if (c.resolved !== undefined) expect(got, c.url).toEqual({ resolved: fill(c.resolved) });
			else expect(got, c.url).toEqual({ errorClass: c.errorClass });
		}
	});

	it("does not download the body", async () => {
		const requests = await requestsDuring(() =>
			page.evaluate(() =>
				(
					window as unknown as { P: { resolveRedirect: (u: string) => Promise<string> } }
				).P.resolveRedirect("/redirect/2/media/ok.mp4"),
			),
		);
		expect(requests.map((r) => r.path)).toEqual([
			"/redirect/2/media/ok.mp4",
			"/redirect/1/media/ok.mp4",
			"/media/ok.mp4",
		]);
	});
});

describe("preload functions against the oracle", () => {
	it("add the same kind of element, in the same place, as the published package", async () => {
		const loaded = oracle.cases.filter((c) => c.added.length === 1);
		expect(loaded.length).toBeGreaterThan(30);
		for (const c of loaded) {
			const got = await run(c.fn, fill(c.url));
			const expected = c.added[0] as { parent: string; html: string };
			expect(got.added, `${c.fn}(${c.url})`).toHaveLength(1);
			const element = got.added[0] as Outcome["added"][number];
			expect(element.parent).toBe(expected.parent);
			expect(expected.html.startsWith(`<${element.tag}`)).toBe(true);
			if (element.as) expect(expected.html).toContain(`as="${element.as}"`);
			expect(got.left).toBe(0);
		}
	});

	it("preload media from another origin without CORS, which the published package cannot", async () => {
		// The oracle added nothing here and logged "Failed to fetch".
		for (const fn of ["preloadVideo", "preloadAudio"]) {
			const file = fn === "preloadVideo" ? "ok.mp4" : "ok.wav";
			const c = oracle.cases.find((x) => x.fn === fn && x.url === `{B}/media/${file}`);
			expect(c?.added).toEqual([]);
			const got = await run(fn, `${servers.originB}/media/${file}`);
			expect(got.ready).toBe(true);
			expect(got.added[0]?.src).toBe(`${servers.originB}/media/${file}`);
		}
	});

	it("download media once: the preload element's own requests, no fetch first", async () => {
		const requests = await requestsDuring(() => run("preloadVideo", "/redirect/1/media/ok.mp4"));
		expect(requests.every((r) => r.dest === "video")).toBe(true);
		expect(requests.filter((r) => r.path === "/media/ok.mp4").length).toBeGreaterThan(0);
	});

	it("report an unreachable asset to onError", async () => {
		const got = await run("preloadVideo", "http://127.0.0.1:1/media/ok.mp4");
		expect(got.ready).toBe(false);
		expect(got.error).toMatch(/preloadVideo\(\) could not load http:\/\/127\.0\.0\.1:1/);
		expect(got.left).toBe(0);
	});

	it("preload a font that @font-face then uses without a second download", async () => {
		const requests = await requestsDuring(() =>
			page.evaluate(async () => {
				const P = (window as unknown as { P: Record<string, (u: string, o: object) => () => void> })
					.P;
				await new Promise<void>((done) =>
					P.preloadFont?.("/media/ok.woff2?face", { onReady: done }),
				);
				const face = new FontFace("Preloaded", "url(/media/ok.woff2?face)");
				document.fonts.add(face);
				await face.load();
			}),
		);
		expect(requests.filter((r) => r.path === "/media/ok.woff2?face")).toHaveLength(1);
	});
});
