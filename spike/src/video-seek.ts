// M3 spike: is the native <video> frame-exact in chrome-headless-shell when seeked to the middle
// of the selected frame's interval?
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { decodeFrameStamp } from "../../packages/testing/src/frame-stamp.ts";
import { launch, serve } from "./common.ts";

const { server, url } = await serve(resolve(import.meta.dirname, "../video-page"));
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 480, height: 270 });
await page.goto(url, { waitUntil: "load" });
const out: Record<string, string> = {};
for (const [file, fps, n] of [
	["stamp-24.mp4", 24, 96],
	["stamp-5994.mp4", 60000 / 1001, 240],
	["stamp-30.mp4", 30, 120],
] as const) {
	await page.evaluate(
		(s) => (window as unknown as { load(s: string): Promise<number> }).load(s),
		file,
	);
	let ok = 0;
	const bad: string[] = [];
	// Random order, including backward seeks.
	const order = Array.from({ length: n }, (_, i) => i).sort(
		(a, b) => ((a * 7919) % n) - ((b * 7919) % n),
	);
	for (const k of order) {
		const t = (k + 0.5) / fps;
		await page.evaluate(
			(x) => (window as unknown as { seekTo(t: number): Promise<void> }).seekTo(x),
			t,
		);
		const img = PNG.sync.read(Buffer.from(await page.screenshot({ type: "png" })));
		const d = decodeFrameStamp(img.data, img.width, img.height, { x: 48, y: 127, blockSize: 16 });
		if (d.ok && d.frame === k) ok++;
		else bad.push(`${k}->${d.ok ? d.frame : "x"}`);
	}
	out[file] = `${ok}/${n} exact${bad.length ? `, bad: ${bad.slice(0, 8).join(" ")}` : ""}`;
}
console.log(JSON.stringify(out, null, 2), createHash("sha1").digest("hex").slice(0, 0));
await browser.close();
server.close();
