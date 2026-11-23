import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { motioOptimizeDeps } from "./optimize-deps.js";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "motio-optimize-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

async function writeJson(path: string, value: unknown) {
	await mkdir(join(path, ".."), { recursive: true });
	await writeFile(path, JSON.stringify(value));
}

describe("motioOptimizeDeps", () => {
	it("excludes the Motio packages and pre-bundles the dependencies of the React ones", async () => {
		await writeJson(join(root, "package.json"), {
			dependencies: { motio: "^1", "@motiojs/lottie": "^1", "lottie-web": "^5", react: "^19" },
			devDependencies: { "@motiojs/cli": "^1" },
		});
		await writeJson(join(root, "node_modules/@motiojs/lottie/package.json"), {
			dependencies: { "@motiojs/core": "1" },
			peerDependencies: { react: "*", "react-dom": "*", "lottie-web": "*" },
		});
		await writeJson(join(root, "node_modules/@motiojs/cli/package.json"), {
			dependencies: { "puppeteer-core": "1" },
		});
		expect(motioOptimizeDeps(root)).toEqual({
			exclude: [
				"@motiojs/cli",
				"@motiojs/core",
				"@motiojs/lottie",
				"@motiojs/media",
				"@motiojs/player",
				"motio",
			],
			include: ["@motiojs/lottie > lottie-web"],
		});
	});

	it("excludes the packages every page loads when the project has no package.json", () => {
		expect(motioOptimizeDeps(root)).toEqual({
			exclude: ["@motiojs/core", "@motiojs/media", "@motiojs/player", "motio"],
			include: [],
		});
	});
});
