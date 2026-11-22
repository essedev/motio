// Capture spike (Linux): BeginFrame against Page.captureScreenshot, throughput and pixel identity.
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import puppeteer from "puppeteer-core";
import { CHROME, DETERMINISM_FLAGS, serve } from "./common.ts";

const FRAMES = 120;
const { server, url } = await serve(resolve(import.meta.dirname, "../dist-page"));
const decode = (b64: string) => PNG.sync.read(Buffer.from(b64, "base64")).data;
const hash = (b64: string) => createHash("sha1").update(decode(b64)).digest("hex");
const firstShots: Record<string, Buffer> = {};

async function run(mode: "screenshot" | "beginframe") {
	const extra =
		mode === "beginframe"
			? [
					"--enable-begin-frame-control",
					"--deterministic-mode",
					"--run-all-compositor-stages-before-draw",
					"--disable-new-content-rendering-timeout",
					"--disable-threaded-animation",
					"--disable-threaded-scrolling",
					"--disable-checker-imaging",
				]
			: ["--disable-checker-imaging"];
	const browser = await puppeteer.launch({
		executablePath: CHROME,
		headless: true,
		args: [...DETERMINISM_FLAGS, ...extra, "--window-size=1920,1080"],
		defaultViewport: { width: 1920, height: 1080 },
	});
	const page = await browser.newPage();
	const cdp = await page.createCDPSession();
	if (mode === "beginframe") await cdp.send("HeadlessExperimental.enable" as never).catch(() => {});
	await page.goto(`${url}?seekanim=1`, { waitUntil: "load" });
	await page.waitForFunction("window.__motio !== undefined");
	const hashes: string[] = [];
	const t = performance.now();
	for (let f = 0; f < FRAMES; f++) {
		await page.evaluate((x) => window.__motio.seek(x), f);
		if (mode === "screenshot") {
			const r = (await cdp.send("Page.captureScreenshot", {
				format: "png",
				optimizeForSpeed: true,
			})) as { data: string };
			hashes.push(hash(r.data));
			if (f === 30) firstShots.s = decode(r.data);
		} else {
			const r = (await cdp.send(
				"HeadlessExperimental.beginFrame" as never,
				{ screenshot: { format: "png", optimizeForSpeed: true } } as never,
			)) as { hasDamage: boolean; screenshotData?: string };
			hashes.push(r.screenshotData ? hash(r.screenshotData) : "none");
			if (f === 30 && r.screenshotData) firstShots.b = decode(r.screenshotData);
		}
	}
	const ms = (performance.now() - t) / FRAMES;
	await browser.close();
	return { ms, hashes };
}

const out: Record<string, unknown> = {};
try {
	const s = await run("screenshot");
	out.screenshot = `${s.ms.toFixed(1)} ms/frame`;
	const b = await run("beginframe");
	out.beginframe = `${b.ms.toFixed(1)} ms/frame, frames without screenshot: ${b.hashes.filter((h) => h === "none").length}`;
	out.identicalFrames = s.hashes.filter((h, i) => h === b.hashes[i]).length;
	const a = firstShots.s,
		c = firstShots.b;
	if (a && c) {
		let max = 0,
			n = 0;
		const tiles = new Set<number>();
		for (let i = 0; i < a.length; i++) {
			const d = Math.abs((a[i] ?? 0) - (c[i] ?? 0));
			if (d > 0) {
				n++;
				const px = i >> 2;
				const x = px % 1920,
					y = Math.floor(px / 1920);
				if (x < 1280 && y < 720) tiles.add(Math.floor(x / 320) + 4 * Math.floor(y / 360));
				else tiles.add(-1);
			}
			max = Math.max(max, d);
		}
		out.frame30 = { maxDiff: max, differingChannels: n, tiles: [...tiles] };
	}
	out.bfDistinct = new Set(b.hashes).size;
	out.ssDistinct = new Set(s.hashes).size;
} catch (e) {
	out.error = String(e);
}
console.log(JSON.stringify(out, null, 2));
server.close();
