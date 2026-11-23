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

// M1 done criterion: every run gives the decoded frames of a render with a new page per frame,
// whatever the order and the concurrency. The reference has no history, so runs that are wrong in
// the same way (D-072) cannot agree with it by accident.
const REFERENCE = { name: "a new page per frame", concurrency: 1, recycleEveryNFrames: 1 };
const VARIANTS: Array<{
	name: string;
	concurrency: number;
	order?: (frames: number[]) => number[];
}> = [
	{ name: "run 1, ascending, concurrency 1", concurrency: 1 },
	{ name: "run 2, ascending, concurrency 1", concurrency: 1 },
	{ name: "descending, concurrency 1", concurrency: 1, order: (f) => [...f].reverse() },
	{ name: "shuffled, concurrency 4", concurrency: 4, order: (f) => shuffle(f, 31) },
	{ name: "ascending, concurrency 8", concurrency: 8 },
	{ name: "shuffled, concurrency 8", concurrency: 8, order: (f) => shuffle(f, 37) },
];

describe("determinism", () => {
	it("gives the decoded frames of a new page per frame in every run, order and concurrency", async () => {
		const composition = await selectComposition({
			serveUrl,
			id: "stamp",
			inputProps: { durationInFrames: 120 },
		});
		const render = async (
			name: string,
			concurrency: number,
			internals: { frameOrder?: (frames: number[]) => number[] },
			recycleEveryNFrames?: number,
		) => {
			const out = join(dir, `${name.replace(/\W+/g, "-")}.mp4`);
			await renderMediaInternal(
				{
					serveUrl,
					composition,
					codec: "h264",
					concurrency,
					outputLocation: out,
					...(recycleEveryNFrames ? { recycleEveryNFrames } : {}),
				},
				internals,
			);
			return hashVideoFrames(out);
		};
		const reference = await render(
			REFERENCE.name,
			REFERENCE.concurrency,
			{},
			REFERENCE.recycleEveryNFrames,
		);
		expect(reference).toHaveLength(120);
		expect(new Set(reference).size).toBeGreaterThan(100);
		for (const v of VARIANTS) {
			const h = await render(v.name, v.concurrency, v.order ? { frameOrder: v.order } : {});
			const differing = h.flatMap((x, f) => (x === reference[f] ? [] : [f]));
			expect({ variant: v.name, differing }).toEqual({ variant: v.name, differing: [] });
		}
	}, 300_000);
});
