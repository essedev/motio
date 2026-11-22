// Reproduces the source-frame sequences Remotion recorded for fixtures/media
// (__golden__/remotion/media.json): selection rule plus exact extraction, decoded from the
// frame stamps of the extracted PNGs.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeFrameStamp } from "../../testing/src/frame-stamp.js";
import { FrameExtractor } from "./extractor.js";
import { type FrameSelection, selectFrame, sourceTime } from "./select.js";

const media = resolve(import.meta.dirname, "../../../fixtures/media");
const golden = JSON.parse(
	readFileSync(resolve(media, "__golden__/remotion/media.json"), "utf8"),
) as {
	video: Record<string, (number | null)[]>;
};
const STAMP = { x: 48, y: 127, blockSize: 16 } as const;

const cases: {
	id: string;
	src: string;
	fps: number;
	mode: FrameSelection;
	playbackRate?: number;
	trimBefore?: number;
	from?: number;
}[] = [
	{ id: "ov-24in30", src: "stamp-24.mp4", fps: 30, mode: "floor" },
	{ id: "ov-30in60", src: "stamp-30.mp4", fps: 60, mode: "floor" },
	{ id: "ov-5994in30", src: "stamp-5994.mp4", fps: 30, mode: "floor" },
	{ id: "ov-60in30", src: "stamp-60.mp4", fps: 30, mode: "floor" },
	{ id: "ov-rate2", src: "stamp-30.mp4", fps: 30, mode: "floor", playbackRate: 2 },
	{ id: "ov-trim", src: "stamp-30.mp4", fps: 30, mode: "floor", trimBefore: 15, from: 10 },
	{ id: "html5-24in30", src: "stamp-24.mp4", fps: 30, mode: "nearest" },
	{ id: "media-24in30", src: "stamp-24.mp4", fps: 30, mode: "floor" },
];

function stampOf(png: Buffer): number | null {
	const r = spawnSync(
		"ffmpeg",
		["-loglevel", "error", "-i", "-", "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
		{ input: png, maxBuffer: 1 << 26 },
	);
	const d = decodeFrameStamp(r.stdout, 480, 270, STAMP);
	return d.ok ? d.frame : null;
}

describe("source frames against the Remotion recordings", () => {
	const extractor = new FrameExtractor();
	for (const c of cases) {
		it(c.id, async () => {
			const src = resolve(media, "public", c.src);
			const { timestamps } = await extractor.info(src);
			const want = golden.video[c.id] ?? [];
			const got: (number | null)[] = [];
			for (let f = 0; f < want.length; f++) {
				const local = f - (c.from ?? 0);
				if (local < 0) {
					got.push(null);
					continue;
				}
				const t = sourceTime({
					frame: local,
					fps: c.fps,
					trimBefore: c.trimBefore ?? 0,
					playbackRate: c.playbackRate ?? 1,
				});
				got.push(stampOf(await extractor.frame(src, selectFrame(timestamps, t, c.mode))));
			}
			if (c.mode === "floor") {
				expect(got).toEqual(want);
				return;
			}
			// Remotion's HTML5 Video is not frame-exact in renders: its recording jumps back to stale
			// frames and is inconsistent on fractional positions (D-015). Motio is deterministic, so
			// require the nearest rule exactly and a high agreement with the recording.
			const rule = want.map((_, f) =>
				selectFrame(timestamps, sourceTime({ frame: f, fps: c.fps }), "nearest"),
			);
			expect(got).toEqual(rule);
			const agree = got.filter((v, i) => v === want[i]).length / want.length;
			expect(agree).toBeGreaterThanOrEqual(0.75);
		});
	}
});
