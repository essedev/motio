// M2 proof: every composition of fixtures/features (transitions, shapes, paths, noise), written
// against the Remotion API and resolved through the compat alias like a user project, matches the
// stills recorded from Remotion 4.0.545 within the M1 thresholds, on both capture paths: PNG
// stills (CPU raster, GPU compositing) and JPEG stills, the default video capture with software
// compositing (D-041, D-050), against Remotion's JPEG stills.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bundle } from "@motiojs/bundler";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { renderMedia, renderStill, selectComposition } from "@motiojs/renderer";
import { decodeImage, decodeVideoFrames, psnr, type RgbaImage, ssim } from "@motiojs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const FIXTURE = resolve(import.meta.dirname, "../../../fixtures/features");
const GOLDEN = join(FIXTURE, "__golden__/remotion");
const GOLDEN_JPEG = join(FIXTURE, "__golden__/remotion-jpeg");
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

for (const path of [
	{ name: "PNG", format: "png", golden: GOLDEN },
	{ name: "JPEG", format: "jpeg", golden: GOLDEN_JPEG },
] as const) {
	describe(`fixtures/features against Remotion's ${path.name} stills`, () => {
		for (const [id, frames] of Object.entries(FRAMES)) {
			it(`${id}: frames ${frames.join(", ")}`, async () => {
				const composition = await selectComposition({ serveUrl, id, inputProps: {} });
				const scores: { frame: number; ssim: number; psnr: number }[] = [];
				for (const frame of frames) {
					const { buffer } = await renderStill({
						serveUrl,
						composition,
						frame,
						imageFormat: path.format,
						...(path.format === "jpeg" ? { jpegQuality: 80 } : {}),
					});
					if (!buffer) throw new Error(`no image for ${id} frame ${frame}`);
					const ours = await decodeImage(buffer);
					const ref = await decodeImage(
						readFileSync(join(path.golden, id, `${String(frame).padStart(4, "0")}.${path.format}`)),
					);
					scores.push({ frame, ssim: ssim(ours, ref), psnr: psnr(ours, ref) });
				}
				console.log(
					scores
						.map(
							(s) =>
								`${path.name} ${id} ${s.frame}: SSIM ${s.ssim.toFixed(5)}, PSNR ${s.psnr.toFixed(2)} dB`,
						)
						.join("\n"),
				);
				const mean = scores.reduce((sum, s) => sum + s.ssim, 0) / scores.length;
				expect(mean).toBeGreaterThanOrEqual(MEAN_SSIM);
				expect(scores.filter((s) => s.ssim < WORST_SSIM || s.psnr < MIN_PSNR_DB)).toEqual([]);
			});
		}
	});
}

describe("an H.264 render with the default capture", () => {
	let dir: string;
	beforeAll(async () => {
		dir = await mkdtemp(join(tmpdir(), "motio-features-video-"));
	});
	afterAll(async () => {
		if (dir) await rm(dir, { recursive: true, force: true });
	});

	it("shows the flip transition over black, close to Remotion's JPEG still", async () => {
		// Frames 80 and 85: the flip over the composition's transparent background, which an opaque
		// video shows black, as Remotion's does.
		const composition = await selectComposition({ serveUrl, id: "transitions", inputProps: {} });
		const output = join(dir, "transitions.mp4");
		await renderMedia({
			serveUrl,
			composition,
			codec: "h264",
			frameRange: [80, 85],
			outputLocation: output,
		});
		const decoded: RgbaImage[] = [];
		for await (const f of decodeVideoFrames(output)) decoded.push(f);
		expect(decoded).toHaveLength(6);
		for (const [i, frame] of [
			[0, 80],
			[5, 85],
		] as const) {
			const ours = decoded[i];
			if (!ours) throw new Error(`frame ${frame} missing`);
			const ref = await decodeImage(
				readFileSync(join(GOLDEN_JPEG, "transitions", `${String(frame).padStart(4, "0")}.jpeg`)),
			);
			const p = psnr(ours, ref);
			const s = ssim(ours, ref);
			console.log(`H.264 transitions ${frame}: SSIM ${s.toFixed(5)}, PSNR ${p.toFixed(2)} dB`);
			// The top right corner is outside the flipped panel: black, not Chrome's default white.
			const corner = (10 * ours.width + ours.width - 10) * 4;
			expect(Math.max(...ours.data.subarray(corner, corner + 3))).toBeLessThanOrEqual(4);
			expect(s).toBeGreaterThanOrEqual(WORST_SSIM);
		}
	});
});
