import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as noReact from "./no-react.js";

const here = dirname(fileURLToPath(import.meta.url));

/** Every module specifier reachable from `file` through relative imports. */
const reachableImports = (file: string, seen = new Set<string>()): Set<string> => {
	const found = new Set<string>();
	if (seen.has(file)) return found;
	seen.add(file);
	const source = readFileSync(file, "utf8");
	for (const match of source.matchAll(/(?:import|export)[^"']*?from\s+["']([^"']+)["']/g)) {
		const specifier = match[1] as string;
		found.add(specifier);
		if (specifier.startsWith(".")) {
			const target = join(dirname(file), specifier.replace(/\.js$/, ".ts"));
			for (const s of reachableImports(target, seen)) found.add(s);
		}
	}
	return found;
};

describe("@motiojs/core/no-react", () => {
	it("exports the names of remotion/no-react", () => {
		// Recorded with Object.keys(require("remotion/no-react")), internals left out.
		expect(Object.keys(noReact).sort()).toEqual([
			"assertValidInterpolateEasingOption",
			"assertValidInterpolatePosterizeOption",
			"interpolate",
			"random",
		]);
	});

	it("never imports React", () => {
		const imports = [...reachableImports(join(here, "no-react.ts"))];
		expect(imports.filter((s) => !s.startsWith("."))).toEqual([]);
	});
});
