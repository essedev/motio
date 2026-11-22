import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeVideoFrames, probeVideo } from "@motiojs/testing";
import { afterAll, describe, expect, it } from "vitest";
import { renderMedia, selectComposition } from "./index.js";
import { fixturePageDir } from "./test-support/fixture-page.js";

const serveUrl = fixturePageDir();
const dir = mkdtempSync(join(tmpdir(), "motio-colour-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("colour", () => {
	for (const imageFormat of ["jpeg", "png"] as const) {
		it(`round trips the palette within 2 code values (${imageFormat} capture)`, async () => {
			const composition = await selectComposition({ serveUrl, id: "palette" });
			const out = join(dir, `palette-${imageFormat}.mp4`);
			await renderMedia({ serveUrl, composition, codec: "h264", imageFormat, outputLocation: out });

			const probe = await probeVideo(out);
			expect(probe).toMatchObject({
				codec: "h264",
				pixelFormat: "yuv420p",
				colorSpace: "bt709",
				colorPrimaries: "bt709",
				colorTransfer: "bt709",
				colorRange: "tv",
				frameRate: "25/1",
				frameCount: composition.durationInFrames,
			});

			const { patch, columns, palette } = composition.props as {
				patch: number;
				columns: number;
				palette: [number, number, number][];
			};
			let worst = 0;
			let frames = 0;
			for await (const f of decodeVideoFrames(out)) {
				for (const [i, expected] of palette.entries()) {
					const x0 = (i % columns) * patch + patch / 4;
					const y0 = Math.floor(i / columns) * patch + patch / 4;
					// Mean over the central half of the patch, away from chroma bleeding at edges.
					const sum = [0, 0, 0];
					let n = 0;
					for (let y = y0; y < y0 + patch / 2; y++) {
						for (let x = x0; x < x0 + patch / 2; x++) {
							const p = (y * f.width + x) * 4;
							for (let c = 0; c < 3; c++) sum[c] = (sum[c] ?? 0) + (f.data[p + c] ?? 0);
							n++;
						}
					}
					for (let c = 0; c < 3; c++) {
						const err = Math.abs((sum[c] ?? 0) / n - (expected[c] ?? 0));
						worst = Math.max(worst, err);
						if (err > 2) {
							throw new Error(
								`frame ${f.index} patch ${i} rgb(${expected}) channel ${c}: got ${((sum[c] ?? 0) / n).toFixed(2)}`,
							);
						}
					}
				}
				frames++;
			}
			console.log(
				`${imageFormat}: worst patch error ${worst.toFixed(2)} code values over ${frames} frames`,
			);
			expect(frames).toBe(composition.durationInFrames);
		}, 120_000);
	}

	it("rejects odd dimensions with yuv420p", async () => {
		const composition = await selectComposition({ serveUrl, id: "odd" });
		await expect(
			renderMedia({ serveUrl, composition, codec: "h264", outputLocation: join(dir, "odd.mp4") }),
		).rejects.toMatchObject({ code: "E_ODD_DIMENSIONS" });
	});
});
