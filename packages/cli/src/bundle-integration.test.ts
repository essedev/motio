import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
	createBundle,
	loadEnvVariables,
	loadRemotionConfig,
	resolveEntryPoint,
} from "@motiojs/bundler";
import { describe, expect, it } from "vitest";
import { runCli } from "./main.js";
import { fakeRenderer, testDeps, testIo } from "./test-support/fakes.js";

const fixtures = fileURLToPath(new URL("../../bundler/test-fixtures/", import.meta.url));

describe("CLI with the real bundler", () => {
	it("bundles the project from remotion.config.ts, hands the bundle to the renderer and removes it", async () => {
		const io = testIo(`${fixtures}with-config`);
		const { renderer } = fakeRenderer();
		let index = "";
		let serveUrl = "";
		renderer.getCompositions = async (options) => {
			serveUrl = options.serveUrl;
			index = await readFile(`${options.serveUrl}/index.html`, "utf8");
			return [];
		};
		const code = await runCli(
			["compositions", "--json"],
			io,
			testDeps(renderer, {
				loadRemotionConfig,
				loadEnvVariables,
				resolveEntryPoint,
				createBundle: (options) =>
					createBundle({
						...options,
						runtimeModule: `${fixtures}fake-runtime.js`,
						compat: { aliases: { remotion: `${fixtures}fake-motio.js` }, symbols: "off" },
					}),
			}),
		);
		expect(code).toBe(0);
		const result = JSON.parse(io.out.join(""));
		expect(result).toMatchObject({ ok: true, compositions: [] });
		expect(result.warnings.some((w: string) => w.includes("D-003"))).toBe(true);
		expect(index).toMatch(/<script type="module" src="\.\/assets\/[^"]+\.js"><\/script>/);
		expect(existsSync(serveUrl)).toBe(false);
	});

	it("passes a prebuilt bundle directory through without bundling", async () => {
		const io = testIo(fixtures);
		const { renderer, calls } = fakeRenderer();
		const dir = fileURLToPath(new URL("../../bundler/test-fixtures/basic/public", import.meta.url));
		const code = await runCli(
			["compositions", dir, "--json"],
			io,
			testDeps(renderer, {
				loadRemotionConfig,
				loadEnvVariables,
				resolveEntryPoint,
				createBundle: async () => {
					throw new Error("should not bundle");
				},
			}),
		);
		// public/ has no index.html: rejected as a usage error rather than bundled.
		expect(code).toBe(2);
		expect(calls.getCompositions).toBeUndefined();
		expect(existsSync(dir)).toBe(true);
	});
});
