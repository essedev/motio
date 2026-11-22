// Capture spike: throughput of Page.captureScreenshot in PNG and JPEG, raw and piped to FFmpeg.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { launch, serve } from "./common.ts";

const FRAMES = 60;
const { server, url } = await serve(resolve(import.meta.dirname, "../dist-page"));
const results: Record<string, string> = {};

for (const [w, h] of [
	[1280, 720],
	[1920, 1080],
] as const) {
	const browser = await launch([`--window-size=${w},${h}`]);
	const page = await browser.newPage();
	await page.setViewport({ width: w, height: h });
	await page.goto(`${url}?shim=1&seekanim=1`, { waitUntil: "load" });
	await page.waitForFunction("window.__motio !== undefined");
	const cdp = await page.createCDPSession();

	// seek only
	let t = performance.now();
	for (let f = 0; f < FRAMES; f++) await page.evaluate((x) => window.__motio.seek(x), f);
	results[`${w}x${h} seek only`] = `${((performance.now() - t) / FRAMES).toFixed(1)} ms/frame`;

	for (const fmt of [
		{ format: "png" },
		{ format: "jpeg", quality: 90 },
		{ format: "jpeg", quality: 80 },
	] as const) {
		const label = `${w}x${h} ${fmt.format}${"quality" in fmt ? fmt.quality : ""}`;
		let bytes = 0;
		t = performance.now();
		for (let f = 0; f < FRAMES; f++) {
			await page.evaluate((x) => window.__motio.seek(x), f);
			const r = (await cdp.send("Page.captureScreenshot", { ...fmt, optimizeForSpeed: true })) as {
				data: string;
			};
			bytes += r.data.length * 0.75;
		}
		const ms = (performance.now() - t) / FRAMES;
		// piped to ffmpeg libx264
		const ff = spawn(
			"ffmpeg",
			[
				"-y",
				"-loglevel",
				"error",
				"-f",
				"image2pipe",
				"-framerate",
				"30",
				"-i",
				"-",
				"-c:v",
				"libx264",
				"-preset",
				"veryfast",
				"-crf",
				"18",
				"-pix_fmt",
				"yuv420p",
				`/tmp/motio-spike-${fmt.format}.mp4`,
			],
			{ stdio: ["pipe", "inherit", "inherit"] },
		);
		t = performance.now();
		for (let f = 0; f < FRAMES; f++) {
			await page.evaluate((x) => window.__motio.seek(x), f);
			const r = (await cdp.send("Page.captureScreenshot", { ...fmt, optimizeForSpeed: true })) as {
				data: string;
			};
			if (!ff.stdin.write(Buffer.from(r.data, "base64")))
				await new Promise((ok) => ff.stdin.once("drain", ok));
		}
		ff.stdin.end();
		await new Promise((ok) => ff.on("close", ok));
		const msPipe = (performance.now() - t) / FRAMES;
		results[label] =
			`capture ${ms.toFixed(1)} ms/frame (${(1000 / ms).toFixed(0)} fps), ${(bytes / FRAMES / 1024).toFixed(0)} KiB/frame; with x264 ${msPipe.toFixed(1)} ms/frame`;
	}
	await browser.close();
}
console.log(JSON.stringify(results, null, 2));
server.close();
