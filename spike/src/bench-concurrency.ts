// Capture spike: throughput with N pages in one browser and N browsers, 1080p JPEG 80.
import { resolve } from "node:path";
import type { Browser } from "puppeteer-core";
import { launch, serve } from "./common.ts";

const TOTAL = 240;
const { server, url } = await serve(resolve(import.meta.dirname, "../dist-page"));

async function worker(browser: Browser, queue: number[]) {
	const page = await browser.newPage();
	await page.setViewport({ width: 1920, height: 1080 });
	await page.goto(`${url}?seekanim=1`, { waitUntil: "load" });
	await page.waitForFunction("window.__motio !== undefined");
	const cdp = await page.createCDPSession();
	for (let f = queue.shift(); f !== undefined; f = queue.shift()) {
		await page.evaluate((x) => window.__motio.seek(x), f);
		await cdp.send("Page.captureScreenshot", {
			format: "jpeg",
			quality: 80,
			optimizeForSpeed: true,
		});
	}
	await page.close();
}

const out: Record<string, string> = {};
for (const n of [1, 2, 4, 8]) {
	for (const layout of ["pages", "browsers"] as const) {
		const browsers = await Promise.all(
			Array.from({ length: layout === "pages" ? 1 : n }, () => launch(["--window-size=1920,1080"])),
		);
		const queue = Array.from({ length: TOTAL }, (_, i) => i);
		const t = performance.now();
		await Promise.all(
			Array.from({ length: n }, (_, i) => worker(browsers[i % browsers.length] as Browser, queue)),
		);
		const s = (performance.now() - t) / 1000;
		out[`${n} ${layout}`] = `${(TOTAL / s).toFixed(1)} fps`;
		await Promise.all(browsers.map((b) => b.close()));
	}
}
console.log(JSON.stringify(out, null, 2));
server.close();
