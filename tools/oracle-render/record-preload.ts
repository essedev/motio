// Records the published @remotion/preload in the pinned chrome-headless-shell (preload-probe.ts,
// public API only): for preloadVideo/Audio/Image/Font, the elements each call adds to the page,
// the requests the server sees, console output, what the returned function removes; frees before
// the redirect check ends; the same URL twice; resolveRedirect() over redirects, failures and
// cross-origin URLs with and without CORS. Also each function outside the browser (in Node).
// Writes packages/preload/src/__oracle__/preload.json. Run: pnpm record:preload
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
	preloadAudio,
	preloadFont,
	preloadImage,
	preloadVideo,
	resolveRedirect,
} from "@remotion/preload";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import { startPreloadServers } from "../../fixtures/preload/server.ts";
import type { PreloadProbeSpec } from "./preload-probe.ts";

const here = import.meta.dirname;
const root = resolve(here, "../..");
const outDir = join(root, "packages/preload/src/__oracle__");
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
const chrome =
	process.env.MOTIO_BROWSER_EXECUTABLE ??
	resolve(
		process.env.HOME ?? "",
		".cache/motio/browsers/chrome-headless-shell/mac_arm-158.0.8127.36/chrome-headless-shell-mac-arm64/chrome-headless-shell",
	);

const js =
	(
		await build({
			stdin: {
				contents: `import { runPreloadProbe } from "./preload-probe.ts"; window.runPreloadProbe = runPreloadProbe;`,
				resolveDir: here,
				loader: "ts",
			},
			bundle: true,
			write: false,
			format: "iife",
			platform: "browser",
			define: { "process.env.NODE_ENV": '"production"' },
		})
	).outputFiles[0]?.text ?? "";
const html = `<!doctype html><html><head></head><body><script>${js}</script></body></html>`;
const { originA, originB, log, close } = await startPreloadServers(html);

const FILE_OF = {
	preloadVideo: "ok.mp4",
	preloadAudio: "ok.wav",
	preloadImage: "ok.png",
	preloadFont: "ok.woff2",
} as const;
const cases: PreloadProbeSpec["cases"] = [];
for (const [fn, file] of Object.entries(FILE_OF) as [keyof typeof FILE_OF, string][]) {
	for (const url of [
		`/media/${file}`,
		`${originA}/media/${file}`,
		`/redirect/1/media/${file}`,
		`/redirect/3/media/${file}`,
		`/to-b/media/${file}`,
		`${originB}/media/${file}`,
		`${originB}/cors/media/${file}`,
		`${originB}/cors/redirect/2/media/${file}`,
		"/missing",
		"/media/missing.bin",
		`http://127.0.0.1:1/media/${file}`,
		"",
	]) {
		cases.push({ fn, url });
	}
}
const spec: PreloadProbeSpec = {
	cases,
	redirects: [
		"/media/ok.png",
		`${originA}/media/ok.png`,
		"/redirect/1/media/ok.png",
		"/redirect/4/media/ok.png",
		"/to-b/media/ok.png",
		"/missing",
		`${originB}/media/ok.png`,
		`${originB}/cors/media/ok.png`,
		`${originB}/cors/redirect/2/media/ok.png`,
		`http://127.0.0.1:1/x`,
		"",
		"not a url",
	],
	waitMs: 400,
};

// In Node: what each function does without a browser.
const node: Record<string, unknown> = {};
for (const fn of Object.keys(FILE_OF) as (keyof typeof FILE_OF)[]) {
	const logs: unknown[] = [];
	const original = {
		log: console.log,
		warn: console.warn,
		error: console.error,
		info: console.info,
	};
	for (const level of Object.keys(original) as (keyof typeof original)[]) {
		console[level] = (...args: unknown[]) => logs.push({ level, args: args.map(String) });
	}
	let result: unknown;
	try {
		const unpreload = { preloadAudio, preloadFont, preloadImage, preloadVideo }[fn](
			`${originA}/media/ok.png`,
		);
		result = { returns: typeof unpreload, callReturns: String(unpreload()) };
	} catch (e) {
		result = { error: String(e) };
	} finally {
		Object.assign(console, original);
	}
	node[fn] = { ...(result as object), logs };
}
try {
	node.resolveRedirect = {
		resolved: await resolveRedirect(`${originA}/redirect/2/media/ok.png`),
	};
} catch (e) {
	node.resolveRedirect = { error: String(e) };
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
let result: unknown;
try {
	const page = await browser.newPage();
	await page.goto(`${originA}/`);
	log.length = 0;
	result = await page.evaluate(
		(s) =>
			(window as unknown as { runPreloadProbe(spec: unknown): Promise<unknown> }).runPreloadProbe(
				s,
			),
		spec as never,
	);
} finally {
	await browser.close();
	close();
}

// Origins are written as A (the page's) and B (the other one): their ports change on every run.
const anonymise = (text: string) =>
	text.replaceAll(originA, "{A}").replaceAll(originB, "{B}").replaceAll("localhost", "{A-host}");
mkdirSync(outDir, { recursive: true });
writeFileSync(
	join(outDir, "preload.json"),
	`${anonymise(
		JSON.stringify({
			package: "@remotion/preload",
			version: pkg.dependencies["@remotion/preload"],
			chrome: "158.0.8127.36",
			description:
				"@remotion/preload in Chrome: per call, the elements added to head and body, console output while waiting, what the returned function removes; frees before a slow response; the same URL twice; resolveRedirect() results. Origin {A} serves the page, {B} is another origin (paths under /cors/ send Access-Control-Allow-Origin: *). requests: everything both servers received, in order. node: each function outside the browser.",
			...(result as object),
			requests: log,
			node,
		}),
	)}\n`,
);
console.log("preload.json recorded");
