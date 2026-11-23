import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDE_DIR, guidePages, syncPage } from "./sync.js";

describe("docs/guide", () => {
	it("has pages", () => {
		expect(guidePages().length).toBeGreaterThan(5);
	});

	for (const page of guidePages()) {
		it(`${page} shows its example files as they are and has no unchecked TypeScript`, () => {
			const text = readFileSync(join(GUIDE_DIR, page), "utf8");
			const synced = syncPage(text);
			expect(synced.problems).toEqual([]);
			expect(text, "Out of date: run node docs/guide/examples/sync.ts").toBe(synced.text);
		});
	}
});

describe("syncPage", () => {
	it("flags TypeScript blocks without an example comment", () => {
		expect(syncPage("```ts\nconst a = 1;\n```\n```bash\nls\n```").problems).toEqual([
			"line 1: a ts block without an example comment is not type-checked",
		]);
	});
});
