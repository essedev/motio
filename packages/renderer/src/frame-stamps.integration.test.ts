import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type FrameStampOptions, probeVideo } from "@motiojs/testing";
import { afterAll, describe, expect, it } from "vitest";
import { selectComposition } from "./index.js";
import { renderMediaInternal } from "./render-media.js";
import { fixturePageDir, shuffle } from "./test-support/fixture-page.js";
import { stampMismatches } from "./test-support/video-checks.js";

const serveUrl = fixturePageDir();
const dir = mkdtempSync(join(tmpdir(), "motio-stamps-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// M1 done criterion: zero mismatches over at least 3,000 frames at concurrency 1, 4 and 8, frames
// requested in random order, decoded from the encoded MP4.
const RUNS = [
	{ concurrency: 1, frames: 600 },
	{ concurrency: 4, frames: 1200 },
	{ concurrency: 8, frames: 1200 },
];

describe("frame stamps", () => {
	let total = 0;

	for (const run of RUNS) {
		it(`${run.frames} frames in random order at concurrency ${run.concurrency}`, async () => {
			const composition = await selectComposition({
				serveUrl,
				id: "stamp",
				inputProps: { durationInFrames: 3000 },
			});
			// A different window of the composition per run, so the 3,000 frames are distinct.
			const start = RUNS.slice(0, RUNS.indexOf(run)).reduce((s, r) => s + r.frames, 0);
			const out = join(dir, `c${run.concurrency}.mp4`);
			const t = performance.now();
			await renderMediaInternal(
				{
					serveUrl,
					composition,
					codec: "h264",
					concurrency: run.concurrency,
					frameRange: [start, start + run.frames - 1],
					outputLocation: out,
				},
				{ frameOrder: (frames) => shuffle(frames, 1000 + run.concurrency) },
			);
			const seconds = (performance.now() - t) / 1000;
			const stamp = composition.props.stamp as FrameStampOptions;
			const { frames, mismatches } = await stampMismatches(out, (i) => start + i, stamp);
			console.log(
				`concurrency ${run.concurrency}: ${frames} frames, ${mismatches.length} mismatches, ${(run.frames / seconds).toFixed(1)} fps`,
			);
			expect(mismatches).toEqual([]);
			expect(frames).toBe(run.frames);
			const probe = await probeVideo(out);
			expect(probe.frameCount).toBe(run.frames);
			expect(probe.frameRate).toBe("30/1");
			total += frames;
		}, 300_000);
	}

	it("covered at least 3,000 frames", () => {
		expect(total).toBeGreaterThanOrEqual(3000);
	});

	it("waits for state set in an effect inside a transition (React fixture)", async () => {
		const composition = await selectComposition({ serveUrl, id: "effect-state" });
		const out = join(dir, "effect-state.mp4");
		await renderMediaInternal(
			{ serveUrl, composition, codec: "h264", concurrency: 4, outputLocation: out },
			{ frameOrder: (frames) => shuffle(frames, 7) },
		);
		const { frames, mismatches } = await stampMismatches(
			out,
			(i) => i,
			composition.props.stamp as FrameStampOptions,
		);
		expect(mismatches).toEqual([]);
		expect(frames).toBe(composition.durationInFrames);
	}, 120_000);
});
