import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { decodeVideoFrames, hashVideoFrames, probeVideo } from "./video.js";

const dir = mkdtempSync(join(tmpdir(), "motio-testing-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function encode(out: string): void {
	// A flat #336699 clip converted to BT.709 limited range explicitly, 15 frames at 30 fps.
	const r = spawnSync("ffmpeg", [
		"-v",
		"error",
		"-f",
		"lavfi",
		"-i",
		"color=c=0x336699:s=64x48:r=30:d=0.5,format=rgb24",
		"-vf",
		"scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
		"-c:v",
		"libx264",
		"-crf",
		"10",
		"-colorspace",
		"bt709",
		"-color_primaries",
		"bt709",
		"-color_trc",
		"bt709",
		"-color_range",
		"tv",
		out,
	]);
	if (r.status !== 0) throw new Error(r.stderr.toString());
}

describe("video helpers", () => {
	const file = join(dir, "flat.mp4");
	encode(file);

	it("probes stream properties and counts frames", async () => {
		const p = await probeVideo(file);
		expect(p).toMatchObject({
			codec: "h264",
			width: 64,
			height: 48,
			fps: 30,
			frameCount: 15,
			colorSpace: "bt709",
			colorRange: "tv",
		});
	});

	it("decodes back to the source colour within 2 code values", async () => {
		let n = 0;
		for await (const f of decodeVideoFrames(file)) {
			const i = (24 * f.width + 32) * 4;
			expect(Math.abs((f.data[i] ?? 0) - 0x33)).toBeLessThanOrEqual(2);
			expect(Math.abs((f.data[i + 1] ?? 0) - 0x66)).toBeLessThanOrEqual(2);
			expect(Math.abs((f.data[i + 2] ?? 0) - 0x99)).toBeLessThanOrEqual(2);
			n++;
		}
		expect(n).toBe(15);
	});

	it("hashes decoded frames identically across decodes", async () => {
		const a = await hashVideoFrames(file);
		expect(a).toHaveLength(15);
		expect(await hashVideoFrames(file)).toEqual(a);
	});
});
