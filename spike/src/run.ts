// Time-model spike: renders the fixture page in several orders and compares tile hashes.
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import type { Browser } from "puppeteer-core";
import { launch, serve } from "./common.ts";

const FRAMES = 60;
const TILES = ["hook", "effect", "css", "waapi", "raf", "interval", "random", "date"];

function tileHashes(png: Buffer): string[] {
	const img = PNG.sync.read(png);
	return TILES.map((_, i) => {
		const x0 = (i % 4) * 320;
		const y0 = Math.floor(i / 4) * 360;
		const h = createHash("sha1");
		for (let y = y0; y < y0 + 360; y++)
			h.update(img.data.subarray((y * img.width + x0) * 4, (y * img.width + x0 + 320) * 4));
		return h.digest("hex").slice(0, 12);
	});
}

async function renderOrder(
	browser: Browser,
	url: string,
	order: number[],
): Promise<Map<number, string[]>> {
	const page = await browser.newPage();
	await page.goto(url, { waitUntil: "load" });
	await page.waitForFunction("window.__motio !== undefined");
	const out = new Map<number, string[]>();
	for (const f of order) {
		await page.evaluate((frame) => window.__motio.seek(frame), f);
		const png = Buffer.from(await page.screenshot({ type: "png", optimizeForSpeed: true }));
		out.set(f, tileHashes(png));
	}
	await page.close();
	return out;
}

function shuffled(n: number, seed: number): number[] {
	const a = Array.from({ length: n }, (_, i) => i);
	let s = seed;
	for (let i = n - 1; i > 0; i--) {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		const j = s % (i + 1);
		[a[i], a[j]] = [a[j] as number, a[i] as number];
	}
	return a;
}

const { server, url } = await serve(resolve(import.meta.dirname, "../dist-page"));
const browser = await launch();
const modes = [
	{ name: "no-shim", q: "" },
	{ name: "no-shim+seekanim", q: "?seekanim=1" },
	{ name: "shim+seekanim", q: "?shim=1&seekanim=1" },
];
const seq = Array.from({ length: FRAMES }, (_, i) => i);
const results: Record<string, Record<string, string>> = {};
for (const m of modes) {
	const u = url + m.q;
	const runs: Record<string, Map<number, string[]>> = {
		seq: await renderOrder(browser, u, seq),
		seq2: await renderOrder(browser, u, seq),
		rev: await renderOrder(browser, u, [...seq].reverse()),
		shuf: await renderOrder(browser, u, shuffled(FRAMES, 7)),
	};
	// Fresh page per frame: what an isolated worker rendering one frame would produce.
	const fresh = new Map<number, string[]>();
	for (const f of seq) fresh.set(f, (await renderOrder(browser, u, [f])).get(f) as string[]);
	runs.fresh = fresh;
	results[m.name] = {};
	TILES.forEach((tile, ti) => {
		const agree = (a: string, b: string) =>
			seq.filter((f) => runs[a]?.get(f)?.[ti] === runs[b]?.get(f)?.[ti]).length;
		const distinct = new Set(seq.map((f) => runs.seq?.get(f)?.[ti])).size;
		(results[m.name] as Record<string, string>)[tile] =
			`seq=seq2 ${agree("seq", "seq2")}, seq=fresh ${agree("seq", "fresh")}, rev=fresh ${agree("rev", "fresh")}, shuf=fresh ${agree("shuf", "fresh")}, distinct ${distinct}`;
	});
}
console.log(JSON.stringify(results, null, 2));
await browser.close();
server.close();
