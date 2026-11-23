// Runs the published @remotion/layout-utils in the pinned chrome-headless-shell with the Inter
// fixture font and records its outputs over fixtures/layout-utils/cases.ts (public API only).
// Run: pnpm record:layout
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
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

const bundle = await build({
	stdin: {
		contents: `import * as L from "@remotion/layout-utils"; import * as C from "${join(root, "fixtures/layout-utils/cases.ts")}"; window.L = L; window.C = C;`,
		resolveDir: here,
		loader: "ts",
	},
	bundle: true,
	write: false,
	format: "iife",
	platform: "browser",
});
const js = bundle.outputFiles[0]?.text ?? "";
const font = readFileSync(join(root, "fixtures/compositions/public/inter-400.woff2"));
const fontBold = readFileSync(join(root, "fixtures/compositions/public/inter-700.woff2"));
const html = `<!doctype html><html><head><style>@font-face{font-family:Inter;font-weight:400;src:url(/inter-400.woff2)}@font-face{font-family:Inter;font-weight:700;src:url(/inter-700.woff2)}</style></head><body><script>${js}</script></body></html>`;
const server = createServer((req, res) => {
	if (req.url === "/inter-400.woff2")
		res.writeHead(200, { "content-type": "font/woff2" }).end(font);
	else if (req.url === "/inter-700.woff2")
		res.writeHead(200, { "content-type": "font/woff2" }).end(fontBold);
	else res.writeHead(200, { "content-type": "text/html" }).end(html);
}).listen(0);
const port = (server.address() as { port: number }).port;
const browser = await puppeteer.launch({
	executablePath: chrome,
	headless: true,
	args: [
		"--font-render-hinting=none",
		"--disable-lcd-text",
		"--force-color-profile=srgb",
		"--force-device-scale-factor=1",
	],
});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`);
const result = await page.evaluate(async () => {
	const w = window as unknown as {
		L: Record<string, (...a: unknown[]) => unknown>;
		C: Record<string, Record<string, unknown>[]>;
	};
	await document.fonts.load("400 20px Inter");
	await document.fonts.load("700 20px Inter");
	const L = w.L;
	const C = w.C;
	const safe = (fn: () => unknown) => {
		try {
			return { ok: fn() };
		} catch (e) {
			return { error: String((e as Error).message) };
		}
	};
	return {
		measureText: C.measureCases.map((c) => ({ input: c, ...safe(() => L.measureText(c)) })),
		fitText: C.fitTextCases.map((c) => ({ input: c, ...safe(() => L.fitText(c)) })),
		fillTextBox: C.fillTextBoxCases.map((c) => {
			const box = L.fillTextBox({ maxBoxWidth: c.maxBoxWidth, maxLines: c.maxLines }) as {
				add(a: unknown): unknown;
			};
			return {
				input: c,
				steps: (c.words as string[]).map((t) =>
					safe(() => box.add({ text: t, fontFamily: "Inter", fontSize: c.fontSize })),
				),
			};
		}),
		fitTextOnNLines: C.fitTextOnNLinesCases.map((c) => ({
			input: c,
			...safe(() => L.fitTextOnNLines(c)),
		})),
	};
});
await browser.close();
server.close();
const dir = join(root, "fixtures/layout-utils/__golden__/remotion");
mkdirSync(dir, { recursive: true });
writeFileSync(
	join(dir, "layout.json"),
	`${JSON.stringify({ remotion: pkg.dependencies["@remotion/layout-utils"], chrome: "158.0.8127.36", ...result }, null, "\t")}\n`,
);
console.log("recorded");
