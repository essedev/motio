import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveEntryPoint } from "./entry-point.js";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "motio-entry-"));
	await mkdir(join(root, "src", "remotion"), { recursive: true });
	await mkdir(join(root, "remotion"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("resolveEntryPoint", () => {
	it("prefers the argument, then the config", async () => {
		await writeFile(join(root, "a.ts"), "");
		await writeFile(join(root, "b.ts"), "");
		expect(
			resolveEntryPoint({ rootDir: root, entryPoint: "a.ts", configEntryPoint: "b.ts" }),
		).toEqual({
			path: join(root, "a.ts"),
			reason: "argument",
		});
		expect(resolveEntryPoint({ rootDir: root, configEntryPoint: "b.ts" })).toEqual({
			path: join(root, "b.ts"),
			reason: "config",
		});
	});

	it("follows the documented order of common paths", async () => {
		await writeFile(join(root, "src", "remotion", "index.ts"), "");
		expect(resolveEntryPoint({ rootDir: root }).path).toBe(
			join(root, "src", "remotion", "index.ts"),
		);
		await writeFile(join(root, "remotion", "index.ts"), "");
		await writeFile(join(root, "remotion", "index.tsx"), "");
		expect(resolveEntryPoint({ rootDir: root }).path).toBe(join(root, "remotion", "index.tsx"));
		await writeFile(join(root, "src", "index.tsx"), "");
		expect(resolveEntryPoint({ rootDir: root })).toEqual({
			path: join(root, "src", "index.tsx"),
			reason: "common paths",
		});
	});

	it("fails with every path tried, or on a missing explicit entry", () => {
		expect(() => resolveEntryPoint({ rootDir: root })).toThrow(
			expect.objectContaining({
				code: "E_ENTRY_POINT_NOT_FOUND",
				message: expect.stringMatching(
					/^No entry point found in .*\. Pass the file that calls registerRoot\(\) as an argument, or create one of: src\/index\.ts,/,
				),
			}),
		);
		expect(() => resolveEntryPoint({ rootDir: root, entryPoint: "missing.ts" })).toThrow(
			/missing\.ts/,
		);
	});
});
