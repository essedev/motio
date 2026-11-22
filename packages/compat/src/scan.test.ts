import { describe, expect, it } from "vitest";
import { scanSource } from "./scan.js";

const names = (source: string, filename = "file.tsx") =>
	scanSource(filename, source).imports.map((usage) => ({
		specifier: usage.specifier,
		kind: usage.kind,
		symbols: usage.symbols.map((s) => (s.isType ? `type ${s.name}` : s.name)),
	}));

describe("scanSource", () => {
	it("collects named, default and type imports with lines", () => {
		const source = [
			'import React from "react";',
			'import { interpolate, spring as s, type VideoConfig } from "remotion";',
			'import type { PlayerRef } from "@remotion/player";',
			'import fade from "@remotion/transitions/fade";',
		].join("\n");
		expect(names(source)).toEqual([
			{
				specifier: "remotion",
				kind: "static",
				symbols: ["interpolate", "spring", "type VideoConfig"],
			},
			{ specifier: "@remotion/player", kind: "static", symbols: ["type PlayerRef"] },
			{ specifier: "@remotion/transitions/fade", kind: "static", symbols: ["default"] },
		]);
		expect(scanSource("f.ts", source).imports[0]?.symbols[0]?.line).toBe(2);
	});

	it("resolves members read from a namespace import, in code and in JSX", () => {
		const source = `import * as R from "remotion";
export const C = () => { const f = R.useCurrentFrame(); return <R.AbsoluteFill>{R["interpolate"](f, [0, 1], [0, 1])}</R.AbsoluteFill>; };`;
		expect(names(source)[0]?.symbols.sort()).toEqual([
			"AbsoluteFill",
			"interpolate",
			"useCurrentFrame",
		]);
	});

	it("marks a namespace used as a value as opaque", () => {
		const source = `import * as R from "remotion"; console.log(R); R.random(1);`;
		expect(names(source, "a.ts")[0]?.symbols.sort()).toEqual(["*", "random"]);
	});

	it("collects re-exports, dynamic imports and require calls", () => {
		const source = `
export { Sequence } from "remotion";
export * from "@remotion/paths";
const { noise2D } = await import("@remotion/noise");
const lazy = import("@remotion/shapes");
const { Config } = require("@remotion/cli/config");
const all = require("remotion");`;
		expect(names(source, "a.ts")).toEqual([
			{ specifier: "remotion", kind: "reexport", symbols: ["Sequence"] },
			{ specifier: "@remotion/paths", kind: "reexport", symbols: ["*"] },
			{ specifier: "@remotion/noise", kind: "dynamic", symbols: ["noise2D"] },
			{ specifier: "@remotion/shapes", kind: "dynamic", symbols: ["*"] },
			{ specifier: "@remotion/cli/config", kind: "require", symbols: ["Config"] },
			{ specifier: "remotion", kind: "require", symbols: ["*"] },
		]);
	});

	it("records members read from named imports", () => {
		const source = `import { Config } from "@remotion/cli/config";
Config.setCodec("h264"); Config.overrideWebpackConfig((c) => c); Config.setCodec("h265");`;
		const symbol = scanSource("remotion.config.ts", source).imports[0]?.symbols[0];
		expect(symbol?.members).toEqual(["setCodec", "overrideWebpackConfig"]);
	});

	it("ignores unrelated modules and reports parse errors without throwing", () => {
		expect(names(`import x from "remotion-animated"; import "./local";`)).toEqual([]);
		const result = scanSource("broken.ts", `import { a } from "remotion"; const = ;`);
		expect(result.errors.length).toBeGreaterThan(0);
	});
});
