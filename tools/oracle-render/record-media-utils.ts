// Runs the published @remotion/media-utils and @remotion/fonts in the pinned chrome-headless-shell
// over the grid in fixtures/media-utils (probe.ts, fonts-probe.ts; public API only) and records
// the outputs as goldens. Run: pnpm record:media-utils
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import { type LoggedRequest, startFixtureServer } from "../../fixtures/media-utils/server.ts";

const here = import.meta.dirname;
const root = resolve(here, "../..");
const fixtures = join(root, "fixtures/media-utils");
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
const chrome =
	process.env.MOTIO_BROWSER_EXECUTABLE ??
	resolve(
		process.env.HOME ?? "",
		".cache/motio/browsers/chrome-headless-shell/mac_arm-158.0.8127.36/chrome-headless-shell-mac-arm64/chrome-headless-shell",
	);

async function bundle(contents: string): Promise<string> {
	const out = await build({
		stdin: { contents, resolveDir: here, loader: "ts" },
		bundle: true,
		write: false,
		format: "iife",
		platform: "browser",
		define: { "process.env.NODE_ENV": '"production"' },
	});
	return out.outputFiles[0]?.text ?? "";
}

async function record(
	js: string,
	evaluate: (other: string) => Promise<unknown>,
	log: LoggedRequest[],
) {
	const html = `<!doctype html><html><body><script>${js}</script></body></html>`;
	const main = await startFixtureServer(html, { cors: false, log });
	const other = await startFixtureServer(html, { cors: true, log });
	const browser = await puppeteer.launch({
		executablePath: chrome,
		headless: true,
		args: ["--autoplay-policy=no-user-gesture-required"],
	});
	try {
		const page = await browser.newPage();
		await page.goto(`${main.origin}/`);
		return await page.evaluate(evaluate, other.origin);
	} finally {
		await browser.close();
		main.server.close();
		other.server.close();
	}
}

const mediaLog: LoggedRequest[] = [];
const mediaJs = await bundle(`
import * as M from "@remotion/media-utils";
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { runProbe } from "${join(fixtures, "probe.ts")}";
window.runProbe = (other) => runProbe({ M, React, createRoot, flushSync }, other);
`);
const media = await record(
	mediaJs,
	(other) => (window as unknown as { runProbe(o: string): Promise<unknown> }).runProbe(other),
	mediaLog,
);
const requestInitHeader = mediaLog.some(
	(r) => r.path === "/tone.wav" && r.probeHeader === "request-init",
);

const fontsLog: LoggedRequest[] = [];
const fontsJs = await bundle(`
import { loadFont } from "@remotion/fonts";
import { runFontsProbe } from "${join(fixtures, "fonts-probe.ts")}";
window.runFontsProbe = () => runFontsProbe(loadFont);
`);
const fonts = await record(
	fontsJs,
	() => (window as unknown as { runFontsProbe(): Promise<unknown> }).runFontsProbe(),
	fontsLog,
);

const dir = join(fixtures, "__golden__/remotion");
mkdirSync(dir, { recursive: true });
const meta = { chrome: "158.0.8127.36" };
writeFileSync(
	join(dir, "media-utils.json"),
	`${JSON.stringify({ remotion: pkg.dependencies["@remotion/media-utils"], ...meta, requestInitHeader, ...(media as object) }, null, "\t")}\n`,
);
writeFileSync(
	join(dir, "fonts.json"),
	`${JSON.stringify(
		{
			remotion: pkg.dependencies["@remotion/fonts"],
			...meta,
			cases: fonts,
			requests: fontsLog.filter((r) => r.path !== "/").map((r) => `${r.method} ${r.path}`),
		},
		null,
		"\t",
	)}\n`,
);
console.log("recorded");
