// M2 proof: every composition of fixtures/features (transitions, shapes, paths, noise), written
// against the Remotion API and resolved through the compat alias like a user project, matches the
// stills recorded from Remotion 4.0.545 within the M1 thresholds.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bundle } from "@motiojs/bundler";
import { renderStill, selectComposition } from "@motiojs/renderer";
import { decodeImage, psnr, ssim } from "@motiojs/testing";
import { beforeAll, describe, expect, it } from "vitest";

const FIXTURE = resolve(import.meta.dirname, "../../../fixtures/features");
const GOLDEN = join(FIXTURE, "__golden__/remotion");
const FRAMES = JSON.parse(readFileSync(join(FIXTURE, "frames.json"), "utf8")) as Record<
	string,
	number[]
>;

const MEAN_SSIM = 0.99;
const MIN_PSNR_DB = 40;
const WORST_SSIM = 0.97;

let serveUrl: string;
beforeAll(async () => {
	serveUrl = await bundle({
		entryPoint: join(FIXTURE, "src/index.ts"),
		publicDir: join(FIXTURE, "public"),
	});
});

describe("fixtures/features against Remotion's stills", () => {
	for (const [id, frames] of Object.entries(FRAMES)) {
		it(`${id}: frames ${frames.join(", ")}`, async () => {
			const composition = await selectComposition({ serveUrl, id, inputProps: {} });
			const scores: { frame: number; ssim: number; psnr: number }[] = [];
			for (const frame of frames) {
				const { buffer } = await renderStill({ serveUrl, composition, frame, imageFormat: "png" });
				if (!buffer) throw new Error(`no image for ${id} frame ${frame}`);
				const ours = await decodeImage(buffer);
				const ref = await decodeImage(
					readFileSync(join(GOLDEN, id, `${String(frame).padStart(4, "0")}.png`)),
				);
				scores.push({ frame, ssim: ssim(ours, ref), psnr: psnr(ours, ref) });
			}
			console.log(
				scores
					.map((s) => `${id} ${s.frame}: SSIM ${s.ssim.toFixed(5)}, PSNR ${s.psnr.toFixed(2)} dB`)
					.join("\n"),
			);
			const mean = scores.reduce((sum, s) => sum + s.ssim, 0) / scores.length;
			expect(mean).toBeGreaterThanOrEqual(MEAN_SSIM);
			expect(scores.filter((s) => s.ssim < WORST_SSIM || s.psnr < MIN_PSNR_DB)).toEqual([]);
		});
	}
});
