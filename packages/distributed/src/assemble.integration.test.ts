// Encodes frame-stamped chunks independently (as workers would), assembles them without
// re-encoding and checks that the output shows every frame exactly once, in order.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { decodeFrameStamp, frameStampBlocks } from "../../testing/src/frame-stamp.js";
import { assembleChunks } from "./assemble.js";
import { planChunks } from "./plan.js";

const W = 480;
const H = 270;
const STAMP = { x: 48, y: 127, blockSize: 16 } as const;
const dir = mkdtempSync(join(tmpdir(), "motio-dist-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function frame(i: number): Buffer {
	const b = Buffer.alloc(W * H * 3, 0x40);
	for (const blk of frameStampBlocks(i, STAMP)) {
		for (let y = blk.y; y < blk.y + blk.size; y++)
			b.fill(blk.on ? 0xff : 0, (y * W + blk.x) * 3, (y * W + blk.x + blk.size) * 3);
	}
	return b;
}

/** Encodes frames [start, end] like a worker: libx264 with B-frames, video-only MPEG-TS. */
function encodeChunk(start: number, end: number, rate: string, out: string) {
	const raw = Buffer.concat(Array.from({ length: end - start + 1 }, (_, k) => frame(start + k)));
	const r = spawnSync(
		"ffmpeg",
		[
			"-y",
			"-loglevel",
			"error",
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgb24",
			"-s",
			`${W}x${H}`,
			"-r",
			rate,
			"-i",
			"-",
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-crf",
			"16",
			"-bf",
			"3",
			"-pix_fmt",
			"yuv420p",
			"-f",
			"mpegts",
			out,
		],
		{ input: raw, maxBuffer: 1 << 28 },
	);
	if (r.status !== 0) throw new Error(String(r.stderr));
}

function stamps(file: string): (number | null)[] {
	const r = spawnSync(
		"ffmpeg",
		["-loglevel", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
		{ maxBuffer: 1 << 30 },
	);
	const n = r.stdout.length / (W * H * 4);
	return Array.from({ length: n }, (_, i) => {
		const d = decodeFrameStamp(r.stdout.subarray(i * W * H * 4, (i + 1) * W * H * 4), W, H, STAMP);
		return d.ok ? d.frame : null;
	});
}

describe("assembleChunks", () => {
	for (const [rate, label] of [
		["30", "30 fps"],
		["30000/1001", "29.97 fps"],
	] as const) {
		it(`shows every frame exactly once across chunk boundaries at ${label}`, async () => {
			const chunks = planChunks({ frameRange: [0, 239], framesPerChunk: 37 });
			const files = chunks.map((c) => {
				const f = join(dir, `${label.replace(/\W/g, "")}-${c.index}.ts`);
				encodeChunk(c.start, c.end, rate, f);
				return f;
			});
			const out = join(dir, `${label.replace(/\W/g, "")}.mp4`);
			await assembleChunks({ chunks: files, output: out });
			expect(stamps(out)).toEqual(Array.from({ length: 240 }, (_, i) => i));
		});
	}

	it("muxes audio rendered once", async () => {
		const chunks = planChunks({ frameRange: [0, 89], chunks: 3 });
		const files = chunks.map((c) => {
			const f = join(dir, `a-${c.index}.ts`);
			encodeChunk(c.start, c.end, "30", f);
			return f;
		});
		const audio = join(dir, "tone.m4a");
		spawnSync("ffmpeg", [
			"-y",
			"-loglevel",
			"error",
			"-f",
			"lavfi",
			"-i",
			"sine=frequency=440:duration=3",
			"-c:a",
			"aac",
			audio,
		]);
		const out = join(dir, "with-audio.mp4");
		await assembleChunks({ chunks: files, output: out, audio: resolve(audio) });
		const probe = spawnSync("ffprobe", [
			"-v",
			"error",
			"-show_entries",
			"stream=codec_type,nb_frames",
			"-of",
			"csv=p=0",
			out,
		]).stdout.toString();
		expect(probe).toContain("video,90");
		expect(probe).toContain("audio");
		expect(stamps(out)).toEqual(Array.from({ length: 90 }, (_, i) => i));
	});
});
