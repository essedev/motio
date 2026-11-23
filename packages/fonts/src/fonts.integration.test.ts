// Runs Motio's loadFont() in the pinned chrome-headless-shell over the cases of
// fixtures/media-utils/fonts-probe.ts and compares the outcomes and the registered FontFace
// descriptors with the recordings of @remotion/fonts 4.0.545. Rejections compare on behaviour: the
// same cases reject with the same error name, in Motio's own words.
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import puppeteer, { type Browser } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type LoggedRequest, startFixtureServer } from "../../../fixtures/media-utils/server.ts";
import { testChromeArgs } from "../../testing/src/browser.js";
import { compareFailure } from "../../testing/src/oracle-errors.js";

const root = resolve(import.meta.dirname, "../../..");
const fixtures = join(root, "fixtures/media-utils");
const chrome =
	process.env.MOTIO_BROWSER_EXECUTABLE ??
	resolve(
		process.env.HOME ?? "",
		".cache/motio/browsers/chrome-headless-shell/mac_arm-158.0.8127.36/chrome-headless-shell-mac-arm64/chrome-headless-shell",
	);
const golden = JSON.parse(
	readFileSync(join(fixtures, "__golden__/remotion/fonts.json"), "utf8"),
) as {
	cases: unknown[];
	requests: string[];
};

let browser: Browser;
let server: Server;
const log: LoggedRequest[] = [];
let got: unknown[];

beforeAll(async () => {
	const out = await build({
		stdin: {
			contents: `import { loadFont } from "${join(import.meta.dirname, "index.ts")}"; import { runFontsProbe } from "${join(fixtures, "fonts-probe.ts")}"; window.runFontsProbe = () => runFontsProbe(loadFont);`,
			resolveDir: import.meta.dirname,
			loader: "ts",
		},
		bundle: true,
		write: false,
		format: "iife",
		platform: "browser",
		define: { "process.env.NODE_ENV": '"production"' },
	});
	const html = `<!doctype html><html><body><script>${out.outputFiles[0]?.text ?? ""}</script></body></html>`;
	const started = await startFixtureServer(html, { cors: false, log });
	server = started.server;
	browser = await puppeteer.launch({
		executablePath: chrome,
		headless: true,
		args: testChromeArgs(),
	});
	const page = await browser.newPage();
	await page.goto(`${started.origin}/`);
	got = (await page.evaluate(() =>
		(window as unknown as { runFontsProbe(): Promise<unknown> }).runFontsProbe(),
	)) as unknown[];
});

afterAll(async () => {
	await browser?.close();
	server?.close();
});

describe("loadFont against @remotion/fonts 4.0.545 in the same browser", () => {
	it("records real loads", () => {
		expect(golden.cases.length).toBeGreaterThan(5);
	});
	it("resolves, rejects and registers faces identically", () => {
		type Case = { error?: string; name?: string };
		const checked = (got as Case[]).map((actual, i) => {
			const recorded = golden.cases[i] as Case;
			if (recorded.error === undefined) return actual;
			const problem = compareFailure(
				{ name: actual.name, message: actual.error },
				{ error: recorded.error, errorType: recorded.name },
				["format"],
			);
			expect(problem, JSON.stringify(recorded)).toBeUndefined();
			return { ...actual, error: recorded.error };
		});
		expect(checked).toEqual(golden.cases);
	});
	it("fetches the same files, each once", () => {
		expect(log.filter((r) => r.path !== "/").map((r) => `${r.method} ${r.path}`)).toEqual(
			golden.requests,
		);
	});
});
