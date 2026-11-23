import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { declarationExports } from "./manifest-status.js";

const dir = mkdtempSync(join(tmpdir(), "motio-dts-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("declarationExports", () => {
	it("collects declared and re-exported names, following export * through relative files", () => {
		writeFileSync(
			join(dir, "index.d.ts"),
			[
				"export interface A {}",
				"export type B = 1;",
				"export declare const c: number;",
				'export { D, type E } from "./d.js";',
				'export * from "./f.js";',
				'export type { G } from "./g.js";',
				'export * from "external-package";',
			].join("\n"),
		);
		writeFileSync(join(dir, "f.d.ts"), 'export interface F {}\nexport * from "./h.js";\n');
		writeFileSync(join(dir, "h.d.ts"), "export type H = string;\n");
		expect([...declarationExports(join(dir, "index.d.ts"))].sort()).toEqual([
			"A",
			"B",
			"D",
			"E",
			"F",
			"G",
			"H",
			"c",
		]);
	});

	it("returns nothing for a missing file and survives export cycles", () => {
		expect(declarationExports(join(dir, "missing.d.ts")).size).toBe(0);
		writeFileSync(join(dir, "x.d.ts"), 'export type X = 1;\nexport * from "./y.js";\n');
		writeFileSync(join(dir, "y.d.ts"), 'export type Y = 1;\nexport * from "./x.js";\n');
		expect([...declarationExports(join(dir, "x.d.ts"))].sort()).toEqual(["X", "Y"]);
	});
});
