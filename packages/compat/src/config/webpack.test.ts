import { describe, expect, it } from "vitest";
import { enableTailwind } from "../tailwind-v3-entry.js";
import { enableTailwind as enableTailwindV4 } from "../tailwind-v4-entry.js";
import { analyzeWebpackOverrides } from "./webpack.js";

describe("analyzeWebpackOverrides", () => {
	it("finds enableTailwind inside a composed override, without warnings", async () => {
		const result = await analyzeWebpackOverrides([(c) => enableTailwindV4(c)]);
		expect(result).toEqual({ tailwind: "v4", warnings: [] });
	});

	it("warns about any other change, alongside Tailwind", async () => {
		const result = await analyzeWebpackOverrides([
			async function addLoader(c) {
				const withTailwind = enableTailwind(c);
				return {
					...withTailwind,
					module: { rules: [{ test: /\.mdx$/, use: "mdx-loader" }] },
				};
			},
		]);
		expect(result.tailwind).toBe("v3");
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]?.message).toContain('"addLoader"');
		expect(result.warnings[0]?.message).toContain("Vite plugin");
	});

	it("reports overrides that throw instead of failing", async () => {
		const result = await analyzeWebpackOverrides([
			() => {
				throw new Error("needs real webpack");
			},
		]);
		expect(result.tailwind).toBeNull();
		expect(result.warnings[0]?.message).toContain("needs real webpack");
	});
});
