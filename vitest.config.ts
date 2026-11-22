import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: "unit",
					include: ["packages/*/src/**/*.test.{ts,tsx}"],
					exclude: ["**/*.integration.test.{ts,tsx}", "**/node_modules/**"],
					environment: "node",
				},
			},
			{
				test: {
					name: "integration",
					include: ["packages/*/src/**/*.integration.test.{ts,tsx}"],
					environment: "node",
					fileParallelism: false,
					testTimeout: 120_000,
					hookTimeout: 120_000,
				},
			},
		],
	},
});
