// Records exports of the published @remotion/renderer/client and @remotion/media that are plain
// data or have no docs page: the editor and coding-agent constants, and what
// getTargetSampleRate() returns in Node and in the pinned chrome-headless-shell. Public API only.
// Run: pnpm record:exports
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as media from "@remotion/media";
import * as client from "@remotion/renderer/client";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";

const here = import.meta.dirname;
const root = resolve(here, "../..");
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
const chrome =
	process.env.MOTIO_BROWSER_EXECUTABLE ??
	resolve(
		process.env.HOME ?? "",
		".cache/motio/browsers/chrome-headless-shell/mac_arm-158.0.8127.36/chrome-headless-shell-mac-arm64/chrome-headless-shell",
	);

const write = (pkgDir: string, name: string, body: unknown) => {
	const dir = join(root, "packages", pkgDir, "src/__oracle__");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(body, null, "\t")}\n`);
	console.log(`${pkgDir}/src/__oracle__/${name}.json`);
};

const CLIENT_NAMES = [
	"customEditorColumnNumberPlaceholder",
	"customEditorLineNumberPlaceholder",
	"customEditorTargetPathPlaceholder",
	"defaultCodingAgentIds",
	"defaultEditorIds",
] as const;
const values = client as unknown as Record<string, unknown>;
write("renderer", "client", {
	package: "@remotion/renderer/client",
	version: pkg.dependencies["@remotion/renderer"],
	exports: Object.keys(client).sort(),
	values: Object.fromEntries(CLIENT_NAMES.map((name) => [name, values[name]])),
	frozen: Object.fromEntries(CLIENT_NAMES.map((name) => [name, Object.isFrozen(values[name])])),
});

const js = (
	await build({
		stdin: {
			contents: `import { getTargetSampleRate } from "@remotion/media";
window.probe = () => ({ length: getTargetSampleRate.length, value: getTargetSampleRate() });`,
			resolveDir: here,
			loader: "ts",
		},
		bundle: true,
		write: false,
		format: "iife",
		platform: "browser",
		define: { "process.env.NODE_ENV": '"production"' },
	})
).outputFiles[0]?.text;
const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
let inBrowser: unknown;
try {
	const page = await browser.newPage();
	await page.setContent(`<!doctype html><html><body><script>${js}</script></body></html>`);
	inBrowser = await page.evaluate(() => (window as unknown as { probe(): unknown }).probe());
} finally {
	await browser.close();
}
write("media", "exports", {
	package: "@remotion/media",
	version: pkg.dependencies["@remotion/media"],
	chrome: "158.0.8127.36",
	exports: Object.keys(media).sort(),
	getTargetSampleRate: {
		node: { length: media.getTargetSampleRate.length, value: media.getTargetSampleRate() },
		browser: inBrowser,
	},
	AudioForPreview: { typeof: typeof media.AudioForPreview },
});
