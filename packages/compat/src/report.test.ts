import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Manifest } from "./manifest.js";
import { buildReport, createCompatibilityReport } from "./report.js";

const manifest: Manifest = {
	target: "remotion@4.0.545",
	sources: [],
	excluded: "",
	modules: {
		remotion: {
			tier: 1,
			symbols: {
				interpolate: { kind: "value", tier: 1, status: "supported" },
				Video: { kind: "value", tier: 1, status: "missing" },
				watchStaticFile: { kind: "value", tier: 2, status: "stubbed", note: "No-op." },
			},
		},
		"@remotion/google-fonts/*": {
			tier: 1,
			symbols: { loadFont: { kind: "value", tier: 1, status: "approximated" } },
		},
	},
};

describe("buildReport", () => {
	it("classifies symbols and packages and merges locations", () => {
		const report = buildReport(
			[
				{
					file: "a.tsx",
					errors: [],
					imports: [
						{
							specifier: "remotion",
							kind: "static",
							line: 1,
							symbols: [
								{ name: "interpolate", isType: false, line: 1 },
								{ name: "Video", isType: false, line: 1 },
								{ name: "nope", isType: false, line: 1 },
							],
						},
						{
							specifier: "@remotion/google-fonts/Inter",
							kind: "static",
							line: 2,
							symbols: [{ name: "loadFont", isType: false, line: 2 }],
						},
						{
							specifier: "@remotion/lambda",
							kind: "static",
							line: 3,
							symbols: [{ name: "renderMediaOnLambda", isType: false, line: 3 }],
						},
						{ specifier: "@remotion/foo", kind: "static", line: 4, symbols: [] },
					],
				},
				{
					file: "b.tsx",
					errors: [],
					imports: [
						{
							specifier: "remotion",
							kind: "static",
							line: 7,
							symbols: [{ name: "interpolate", isType: false, line: 7 }],
						},
					],
				},
			],
			2,
			manifest,
		);
		const status = Object.fromEntries(
			report.entries.map((e) => [`${e.specifier}#${e.symbol}`, e.status]),
		);
		expect(status).toEqual({
			"remotion#interpolate": "supported",
			"remotion#Video": "missing",
			"remotion#nope": "unknown-symbol",
			"@remotion/google-fonts/Inter#loadFont": "approximated",
			"@remotion/lambda#renderMediaOnLambda": "unsupported-package",
			"@remotion/foo#(side effect)": "unknown-package",
		});
		expect(report.entries.find((e) => e.symbol === "interpolate")?.locations).toEqual([
			{ file: "a.tsx", line: 1 },
			{ file: "b.tsx", line: 7 },
		]);
		expect(report.summary.missing).toBe(1);
		expect(report.ok).toBe(false);
	});
});

describe("deliberately unsupported packages and symbols", () => {
	it("are warnings with the reason, and leave the report ok", () => {
		const report = buildReport(
			[
				{
					file: "site.tsx",
					errors: [],
					imports: [
						{
							specifier: "@remotion/studio-protocol",
							kind: "static",
							line: 1,
							symbols: [{ name: "installInStudio", isType: false, line: 1 }],
						},
						{
							specifier: "remotion",
							kind: "static",
							line: 2,
							symbols: [{ name: "Internals", isType: false, line: 2 }],
						},
					],
				},
			],
			1,
			manifest,
		);
		expect(report.entries.map((e) => [e.symbol, e.status])).toEqual([
			["installInStudio", "not-planned"],
			["Internals", "not-planned"],
		]);
		expect(report.entries.every((e) => e.note?.includes("by design"))).toBe(true);
		expect(report.summary["not-planned"]).toBe(2);
		expect(report.ok).toBe(true);
	});
});

describe("createCompatibilityReport", () => {
	let root: string;
	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), "motio-report-"));
		await mkdir(join(root, "src"));
		await mkdir(join(root, "node_modules", "x"), { recursive: true });
		await writeFile(join(root, "src", "index.ts"), 'import { interpolate } from "remotion";\n');
		await writeFile(join(root, "src", "util.ts"), "export const x = 1;\n");
		await writeFile(join(root, "node_modules", "x", "i.js"), 'import { Video } from "remotion";\n');
	});
	afterAll(() => rm(root, { recursive: true, force: true }));

	it("accepts a type-only import of a type Motio declares that the manifest does not list", async () => {
		const typed = await mkdtemp(join(tmpdir(), "motio-report-types-"));
		try {
			const motio = join(typed, "node_modules", "@motiojs", "motio");
			await mkdir(join(typed, "src"));
			await mkdir(motio, { recursive: true });
			await writeFile(
				join(motio, "package.json"),
				JSON.stringify({ name: "@motiojs/motio", exports: { "./remotion": "./remotion.js" } }),
			);
			await writeFile(join(motio, "remotion.js"), "export {};\n");
			await writeFile(
				join(motio, "remotion.d.ts"),
				"export type EasingFunction = (t: number) => number;\n",
			);
			await writeFile(
				join(typed, "src", "index.ts"),
				'import { type EasingFunction, type Missing, Unknown } from "remotion";\n',
			);
			const report = await createCompatibilityReport(typed, { manifest });
			const status = Object.fromEntries(report.entries.map((e) => [e.symbol, e.status]));
			expect(status).toEqual({
				EasingFunction: "supported",
				Missing: "unknown-symbol",
				Unknown: "unknown-symbol",
			});
		} finally {
			await rm(typed, { recursive: true, force: true });
		}
	});

	it("scans the project and skips node_modules", async () => {
		const report = await createCompatibilityReport(root, { manifest });
		expect(report.filesScanned).toBe(2);
		expect(report.entries.map((e) => e.symbol)).toEqual(["interpolate"]);
		expect(report.ok).toBe(true);
	});

	it("uses the shipped manifest by default", async () => {
		const report = await createCompatibilityReport(root);
		expect(report.target).toBe("remotion@4.0.545");
		expect(report.entries[0]?.tier).toBe(1);
	});
});
