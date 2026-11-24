import { describe, expect, it } from "vitest";
import type { Manifest } from "./manifest.js";
import { updateManifestStatuses } from "./manifest-status.js";

const manifest: Manifest = {
	target: "remotion@4.0.545",
	sources: [],
	excluded: "",
	modules: {
		remotion: {
			tier: 1,
			symbols: {
				interpolate: { kind: "value", tier: 1, status: "missing" },
				random: { kind: "value", tier: 1, status: "supported" },
				watchStaticFile: { kind: "value", tier: 2, status: "stubbed" },
				VideoConfig: { kind: "type", tier: 1, status: "missing" },
			},
		},
		"@remotion/paths": {
			tier: 2,
			symbols: { evolvePath: { kind: "value", tier: 2, status: "missing" } },
		},
		"@remotion/google-fonts/*": {
			tier: 1,
			symbols: { loadFont: { kind: "value", tier: 1, status: "missing" } },
		},
		"@remotion/unknown-wildcard/*": {
			tier: 2,
			symbols: { thing: { kind: "value", tier: 2, status: "missing" } },
		},
	},
};

describe("updateManifestStatuses", () => {
	it("promotes exported symbols, demotes removed ones and keeps manual statuses", async () => {
		const exports: Record<string, string[]> = {
			"@motiojs/motio/remotion": ["interpolate", "watchStaticFile"],
			"@motiojs/google-fonts/Roboto": ["loadFont", "getInfo"],
		};
		const result = await updateManifestStatuses(manifest, async (s) =>
			exports[s] ? new Set(exports[s]) : null,
		);
		expect(result.changes).toEqual([
			{ specifier: "remotion", symbol: "interpolate", from: "missing", to: "supported" },
			{ specifier: "remotion", symbol: "random", from: "supported", to: "missing" },
			{
				specifier: "@remotion/google-fonts/*",
				symbol: "loadFont",
				from: "missing",
				to: "supported",
			},
		]);
		expect(result.manifest.modules.remotion?.symbols.watchStaticFile?.status).toBe("stubbed");
		expect(result.manifest.modules.remotion?.symbols.VideoConfig?.status).toBe("missing");
		expect(result.unavailable).toEqual(["@motiojs/paths"]);
		// Wildcards are checked through their sample module; one without a sample is skipped.
		expect(result.skipped).toEqual(["@remotion/unknown-wildcard/*"]);
		// The input is not mutated.
		expect(manifest.modules.remotion?.symbols.interpolate?.status).toBe("missing");
	});
});
