// A transparent VP9 WebM keeps its alpha through extraction (D-019).
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { FrameExtractor } from "./extractor.js";

const dir = mkdtempSync(join(tmpdir(), "motio-vf-alpha-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

it("extracts the alpha plane of a transparent VP9 WebM", async () => {
	const src = join(dir, "alpha.webm");
	const make = spawnSync("ffmpeg", [
		"-y",
		"-loglevel",
		"error",
		"-f",
		"lavfi",
		"-i",
		"color=c=0x3080c0@0.25:s=64x64:d=0.5,format=rgba",
		"-c:v",
		"libvpx-vp9",
		"-pix_fmt",
		"yuva420p",
		"-auto-alt-ref",
		"0",
		"-lossless",
		"1",
		src,
	]);
	expect(make.status).toBe(0);
	const png = await new FrameExtractor().frame(src, 3);
	const raw = spawnSync(
		"ffmpeg",
		["-loglevel", "error", "-i", "-", "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
		{ input: png },
	).stdout;
	const alpha = raw[3] ?? 0;
	expect(Math.abs(alpha - 64)).toBeLessThanOrEqual(1);
});
