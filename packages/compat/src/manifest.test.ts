import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { findModule, loadManifest, lookupSymbol, parseManifest } from "./manifest.js";
import { mapSpecifier } from "./mapping.js";

describe("manifest.json", () => {
	const manifest = loadManifest();

	it("validates against its schema", () => {
		const schema = JSON.parse(
			readFileSync(new URL("../manifest.schema.json", import.meta.url), "utf8"),
		);
		const validate = new Ajv2020({ allErrors: true }).compile(schema);
		expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
	});

	it("targets the pinned compatibility version", () => {
		expect(manifest.target).toBe("remotion@4.0.545");
	});

	it("only lists modules the plugin maps", () => {
		for (const key of Object.keys(manifest.modules)) {
			const specifier = key.endsWith("/*") ? `${key.slice(0, -2)}/Example` : key;
			expect(mapSpecifier(specifier).kind, key).toBe("mapped");
		}
	});

	it("covers the core API and Tier 1 packages", () => {
		for (const name of [
			"useCurrentFrame",
			"interpolate",
			"Sequence",
			"registerRoot",
			"staticFile",
		]) {
			expect(lookupSymbol(manifest, "remotion", name)?.tier, name).toBe(1);
		}
		expect(lookupSymbol(manifest, "@remotion/transitions/fade", "fade")).toBeDefined();
		expect(lookupSymbol(manifest, "@remotion/cli/config", "Config")).toBeDefined();
		expect(lookupSymbol(manifest, "@remotion/renderer", "renderMedia")?.tier).toBe(1);
	});

	it("matches wildcard modules", () => {
		expect(findModule(manifest, "@remotion/google-fonts/Inter")?.key).toBe(
			"@remotion/google-fonts/*",
		);
	});

	it("rejects an unknown status", () => {
		expect(() =>
			parseManifest(
				JSON.stringify({
					target: "remotion@1.0.0",
					modules: {
						remotion: { tier: 1, symbols: { x: { kind: "value", tier: 1, status: "done" } } },
					},
				}),
			),
		).toThrow(/status "done"/);
	});
});
