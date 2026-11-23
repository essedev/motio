// Runs Motio's layout-utils in the pinned chrome-headless-shell with the Inter fixture font over
// fixtures/layout-utils/cases.ts and compares with the recordings of @remotion/layout-utils.
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import puppeteer, { type Browser } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testChromeArgs } from "../../testing/src/browser.js";

const root = resolve(import.meta.dirname, "../../..");
const chrome =
	process.env.MOTIO_BROWSER_EXECUTABLE ??
	resolve(
		process.env.HOME ?? "",
		".cache/motio/browsers/chrome-headless-shell/mac_arm-158.0.8127.36/chrome-headless-shell-mac-arm64/chrome-headless-shell",
	);
type Golden = Record<
	"measureText" | "fitText" | "fitTextOnNLines",
	{ ok?: unknown; error?: string }[]
> & {
	fillTextBox: { steps: { ok?: unknown }[] }[];
};
const golden = JSON.parse(
	readFileSync(join(root, "fixtures/layout-utils/__golden__/remotion/layout.json"), "utf8"),
) as Golden;

let server: Server;
let browser: Browser;
let got: Golden;

beforeAll(async () => {
	const out = await build({
		stdin: {
			contents: `import * as L from "${join(import.meta.dirname, "index.ts")}"; import * as C from "${join(root, "fixtures/layout-utils/cases.ts")}"; window.L = L; window.C = C;`,
			resolveDir: import.meta.dirname,
			loader: "ts",
		},
		bundle: true,
		write: false,
		format: "iife",
		platform: "browser",
	});
	const js = out.outputFiles[0]?.text ?? "";
	const fonts: Record<string, Buffer> = {
		"/inter-400.woff2": readFileSync(join(root, "fixtures/compositions/public/inter-400.woff2")),
		"/inter-700.woff2": readFileSync(join(root, "fixtures/compositions/public/inter-700.woff2")),
	};
	const html = `<!doctype html><html><head><style>@font-face{font-family:Inter;font-weight:400;src:url(/inter-400.woff2)}@font-face{font-family:Inter;font-weight:700;src:url(/inter-700.woff2)}</style></head><body><script>${js}</script></body></html>`;
	server = createServer((req, res) => {
		const font = fonts[req.url ?? ""];
		if (font) res.writeHead(200, { "content-type": "font/woff2" }).end(font);
		else res.writeHead(200, { "content-type": "text/html" }).end(html);
	}).listen(0);
	const port = (server.address() as { port: number }).port;
	browser = await puppeteer.launch({
		executablePath: chrome,
		headless: true,
		args: testChromeArgs([
			"--font-render-hinting=none",
			"--disable-lcd-text",
			"--force-color-profile=srgb",
			"--force-device-scale-factor=1",
		]),
	});
	const page = await browser.newPage();
	await page.goto(`http://127.0.0.1:${port}/`);
	got = (await page.evaluate(async () => {
		const w = window as unknown as {
			L: Record<string, (...a: unknown[]) => unknown>;
			C: Record<string, Record<string, unknown>[]>;
		};
		await document.fonts.load("400 20px Inter");
		await document.fonts.load("700 20px Inter");
		const { L, C } = w;
		const safe = (fn: () => unknown) => {
			try {
				return { ok: fn() };
			} catch (e) {
				return { error: String((e as Error).message) };
			}
		};
		return {
			measureText: C.measureCases.map((c) => safe(() => L.measureText(c))),
			fitText: C.fitTextCases.map((c) => safe(() => L.fitText(c))),
			fillTextBox: C.fillTextBoxCases.map((c) => {
				const box = L.fillTextBox({ maxBoxWidth: c.maxBoxWidth, maxLines: c.maxLines }) as {
					add(a: unknown): unknown;
				};
				return {
					steps: (c.words as string[]).map((t) =>
						safe(() => box.add({ text: t, fontFamily: "Inter", fontSize: c.fontSize })),
					),
				};
			}),
			fitTextOnNLines: C.fitTextOnNLinesCases.map((c) => safe(() => L.fitTextOnNLines(c))),
		};
	})) as Golden;
});

afterAll(async () => {
	await browser?.close();
	server?.close();
});

describe("layout-utils against @remotion/layout-utils 4.0.545 in the same browser", () => {
	it("compares real measurements", () => {
		expect(golden.measureText.length).toBeGreaterThan(5);
		const sample = got.measureText[2]?.ok as { width: number } | undefined;
		expect(sample?.width ?? 0).toBeGreaterThan(100);
	});
	it("measureText", () =>
		expect(got.measureText.map((r) => r.ok)).toEqual(golden.measureText.map((r) => r.ok)));
	it("fitText", () =>
		expect(got.fitText.map((r) => r.ok)).toEqual(golden.fitText.map((r) => r.ok)));
	it("fillTextBox", () =>
		expect(got.fillTextBox.map((c) => c.steps.map((s) => s.ok))).toEqual(
			golden.fillTextBox.map((c) => c.steps.map((s) => s.ok)),
		));
	it("fitTextOnNLines", () =>
		expect(got.fitTextOnNLines.map((r) => r.ok)).toEqual(golden.fitTextOnNLines.map((r) => r.ok)));
});
