import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashVideoFrames } from "@motiojs/testing";
import { afterAll, describe, expect, it } from "vitest";
import { selectComposition } from "./index.js";
import { renderMediaInternal } from "./render-media.js";
import { fixturePageDir, shuffle } from "./test-support/fixture-page.js";

const serveUrl = fixturePageDir();
const dir = mkdtempSync(join(tmpdir(), "motio-determinism-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// M1 done criterion: identical decoded frame hashes across 2 runs, 2 orders and 3 concurrencies.
const VARIANTS = [
	{ name: "run 1, ascending, concurrency 1", concurrency: 1, shuffled: false },
	{ name: "run 2, ascending, concurrency 1", concurrency: 1, shuffled: false },
	{ name: "shuffled, concurrency 4", concurrency: 4, shuffled: true },
	{ name: "ascending, concurrency 8", concurrency: 8, shuffled: false },
	{ name: "shuffled, concurrency 8", concurrency: 8, shuffled: true },
];

describe("determinism", () => {
	it("gives identical decoded frames across runs, orders and concurrencies", async () => {
		const composition = await selectComposition({
			serveUrl,
			id: "stamp",
			inputProps: { durationInFrames: 120 },
		});
		const hashes: string[][] = [];
		for (const [i, v] of VARIANTS.entries()) {
			const out = join(dir, `v${i}.mp4`);
			await renderMediaInternal(
				{ serveUrl, composition, codec: "h264", concurrency: v.concurrency, outputLocation: out },
				v.shuffled ? { frameOrder: (frames) => shuffle(frames, 31 + i) } : {},
			);
			hashes.push(await hashVideoFrames(out));
		}
		const reference = hashes[0] as string[];
		expect(reference).toHaveLength(120);
		expect(new Set(reference).size).toBeGreaterThan(100);
		for (const [i, h] of hashes.entries()) {
			const differing = h.flatMap((x, f) => (x === reference[f] ? [] : [f]));
			expect({ variant: VARIANTS[i]?.name, differing }).toEqual({
				variant: VARIANTS[i]?.name,
				differing: [],
			});
		}
	}, 300_000);
});
