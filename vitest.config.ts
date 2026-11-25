import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: "unit",
					include: [
						"packages/*/src/**/*.test.{ts,tsx}",
						"tools/benchmark/**/*.test.ts",
						"tools/release/*.test.ts",
						"docs/guide/examples/*.test.ts",
					],
					exclude: [
						"**/*.integration.test.{ts,tsx}",
						"packages/core/src/**/*.test.tsx",
						"**/node_modules/**",
					],
					environment: "node",
				},
			},
			{
				test: {
					// Core components and the page runtime, in a simulated DOM.
					name: "core-dom",
					include: ["packages/core/src/**/*.test.tsx"],
					exclude: ["**/*.integration.test.{ts,tsx}", "**/node_modules/**"],
					environment: "jsdom",
				},
			},
			{
				test: {
					name: "integration",
					include: ["packages/*/src/**/*.integration.test.{ts,tsx}", "promo/*.integration.test.ts"],
					environment: "node",
					fileParallelism: false,
					testTimeout: 120_000,
					hookTimeout: 120_000,
				},
			},
		],
	},
});
