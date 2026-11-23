// <TextBackground> in the pinned chrome-headless-shell: the lines it measures match the text the
// browser laid out, under a scale and a rotation of an ancestor too; it waits for a font that
// loads late before releasing its readiness handle; the SVG carries the fill, border and shadow.
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join, resolve } from "node:path";
import { parsePath } from "@motiojs/paths";
import { build } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testChromeArgs } from "../../testing/src/browser.js";

const root = resolve(import.meta.dirname, "../../..");
const chrome =
	process.env.MOTIO_BROWSER_EXECUTABLE ??
	resolve(
		process.env.HOME ?? "",
		".cache/motio/browsers/chrome-headless-shell/mac_arm-158.0.8127.36/chrome-headless-shell-mac-arm64/chrome-headless-shell",
	);
/** How long the server holds the late font. */
const FONT_DELAY_MS = 800;

let server: Server;
let browser: Browser;
let page: Page;

type Read = {
	d: string | null;
	fill: string | null;
	stroke: string | null;
	strokeWidth: string | null;
	strokeLinejoin: string | null;
	filter: string | null;
	svg: { left: string; top: string; width: number; height: number } | null;
	svgRect: { left: number; top: number; right: number; bottom: number } | null;
	fragments: { left: number; right: number; top: number; bottom: number }[];
	openHandles: (string | null)[];
};

const api = <T>(method: string, ...args: unknown[]): Promise<T> =>
	page.evaluate(
		(m, a) =>
			(
				window as unknown as { __textTest: Record<string, (...x: unknown[]) => unknown> }
			).__textTest[m]?.(...a),
		method,
		args,
	) as Promise<T>;

async function show(scenario: Record<string, unknown>): Promise<Read> {
	await api("render", scenario);
	await api("settle");
	return api<Read>("read");
}

const numbers = (d: string | null) =>
	parsePath(d ?? "").flatMap((i) => Object.values(i).filter((v) => typeof v === "number"));

beforeAll(async () => {
	const out = await build({
		entryPoints: [join(import.meta.dirname, "test-support/entry.tsx")],
		bundle: true,
		write: false,
		format: "iife",
		platform: "browser",
		jsx: "automatic",
		define: { "process.env.NODE_ENV": '"production"' },
	});
	const js = out.outputFiles[0]?.text ?? "";
	const inter400 = readFileSync(join(root, "fixtures/compositions/public/inter-400.woff2"));
	const inter700 = readFileSync(join(root, "fixtures/compositions/public/inter-700.woff2"));
	const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;font-weight:400;src:url(/inter-400.woff2)}
@font-face{font-family:Late;font-weight:400;font-display:block;src:url(/late.woff2)}
body{margin:0;font:40px/1.5 Inter}
</style></head><body><script>${js}</script></body></html>`;
	server = createServer((req, res) => {
		if (req.url === "/inter-400.woff2") {
			res.writeHead(200, { "content-type": "font/woff2" }).end(inter400);
		} else if (req.url === "/late.woff2") {
			setTimeout(
				() => res.writeHead(200, { "content-type": "font/woff2" }).end(inter700),
				FONT_DELAY_MS,
			);
		} else {
			res.writeHead(200, { "content-type": "text/html" }).end(html);
		}
	}).listen(0);
	const port = (server.address() as { port: number }).port;
	browser = await puppeteer.launch({
		executablePath: chrome,
		headless: true,
		args: testChromeArgs(["--font-render-hinting=none", "--force-device-scale-factor=1"]),
	});
	page = await browser.newPage();
	await page.goto(`http://127.0.0.1:${port}/`);
	await page.waitForSelector("body[data-ready=true]");
	await page.evaluate(() => document.fonts.load("40px Inter"));
});

afterAll(async () => {
	await browser?.close();
	server?.close();
});

describe("<TextBackground>", () => {
	it("measures each line as the browser laid it out and places the shape around it", async () => {
		const lines = ["Frames are", "functions", "of time, and so is this"];
		const got = await show({
			text: lines.join("\n"),
			props: { align: "center", cornerRadius: 12, paddingX: 16, paddingY: 4 },
		});
		expect(got.fragments).toHaveLength(3);
		expect(got.openHandles).toEqual([]);
		// Line widths equal the canvas's measurement of the same strings.
		const widths = await Promise.all(lines.map((l) => api<number>("textWidth", "40px Inter", l)));
		got.fragments.forEach((f, i) => {
			expect(f.right - f.left).toBeCloseTo(widths[i] as number, 0);
		});
		// The shape spans the widest line plus the padding, and the lines' total height plus the
		// vertical padding (line-height 1.5 at 40 px: 60 px per line).
		expect(got.svg?.width).toBeCloseTo(Math.max(...widths) + 32, 0);
		expect(got.svg?.height).toBeCloseTo(3 * 60 + 8, 1);
		// Every line fragment is paddingX inside the shape on its own row.
		const svgLeft = got.svgRect?.left ?? 0;
		const path = parsePath(got.d ?? "");
		const xs = path.flatMap((i) => ("x" in i ? [i.x as number] : []));
		for (const f of got.fragments) {
			expect(xs.some((x) => Math.abs(svgLeft + x - (f.left - 16)) < 0.5)).toBe(true);
			expect(xs.some((x) => Math.abs(svgLeft + x - (f.right + 16)) < 0.5)).toBe(true);
		}
	});

	it("measures the same lines under a scaled or rotated ancestor", async () => {
		const scenario = {
			text: "Scaled and\nrotated text\nstill fits",
			props: { align: "right", cornerRadius: 10, paddingX: 12 },
		};
		const plain = numbers((await show(scenario)).d);
		const scaled = numbers(
			(await show({ ...scenario, wrapper: { transform: "scale(0.37)", transformOrigin: "0 0" } }))
				.d,
		);
		const rotated = numbers(
			(await show({ ...scenario, wrapper: { transform: "rotate(23deg) scale(1.4)" } })).d,
		);
		expect(plain.length).toBeGreaterThan(10);
		for (const other of [scaled, rotated]) {
			expect(other).toHaveLength(plain.length);
			other.forEach((v, i) => {
				expect(Math.abs(v - (plain[i] as number))).toBeLessThan(0.05);
			});
		}
	});

	it("holds its readiness handle until a late font has loaded, then measures with it", async () => {
		await api("render", {
			text: "Bold late font",
			props: { cornerRadius: 8, paddingX: 10, style: { fontFamily: "Late, monospace" } },
		});
		const early = await api<Read>("read");
		expect(early.openHandles).toEqual(["Measuring the lines of <TextBackground>"]);
		await page.waitForFunction(
			() =>
				(window as unknown as { __textTest: { read: () => Read } }).__textTest.read().openHandles
					.length === 0,
			{ timeout: FONT_DELAY_MS * 10 },
		);
		await api("settle");
		const late = await api<Read>("read");
		const width = await api<number>("textWidth", "40px Late", "Bold late font");
		expect(late.fragments).toHaveLength(1);
		const fragment = late.fragments[0] as Read["fragments"][number];
		expect(fragment.right - fragment.left).toBeCloseTo(width, 0);
		expect(late.svg?.width).toBeCloseTo(width + 20, 0);
	});

	it("draws the fill, the border with a matching join and the shadow", async () => {
		const got = await show({
			text: "Styled",
			props: {
				cornerRadius: 6,
				join: "sharp",
				fill: "rgb(255, 200, 0)",
				border: { width: 3, color: "black" },
				shadow: { offsetX: 2, offsetY: 4, blur: 6, color: "rgba(0, 0, 0, 0.4)" },
			},
		});
		expect(got.fill).toBe("rgb(255, 200, 0)");
		expect(got.stroke).toBe("black");
		expect(got.strokeWidth).toBe("3");
		expect(got.strokeLinejoin).toBe("miter");
		expect(got.filter).toBe("drop-shadow(rgba(0, 0, 0, 0.4) 2px 4px 6px)");
		expect(got.d).not.toMatch(/C/);
	});

	it("follows wrapping set by a maximum width", async () => {
		const got = await show({
			text: "A long sentence that wraps onto several lines inside a narrow block",
			props: { align: "left", cornerRadius: 10, paddingX: 8, style: { maxWidth: 320 } },
		});
		expect(got.fragments.length).toBeGreaterThanOrEqual(3);
		const left = got.svgRect?.left ?? 0;
		for (const f of got.fragments) expect(f.left - 8).toBeCloseTo(left, 0);
	});
});
