import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadEnvVariables } from "./env.js";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "motio-env-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("loadEnvVariables", () => {
	it("reads .env and the REMOTION_ shell variables, the shell winning", async () => {
		await writeFile(join(root, ".env"), 'A=1\nREMOTION_B=file\n# comment\nQUOTED="x y"\n');
		await writeFile(join(root, ".env.local"), "IGNORED=1\n");
		const result = loadEnvVariables({
			rootDir: root,
			processEnv: { REMOTION_B: "shell", REMOTION_C: "c", HOME: "/home/me" },
		});
		expect(result.file).toBe(join(root, ".env"));
		expect(result.variables).toEqual({
			A: "1",
			REMOTION_B: "shell",
			QUOTED: "x y",
			REMOTION_C: "c",
		});
	});

	it("falls back to .env.local when there is no .env", async () => {
		await writeFile(join(root, ".env.local"), "LOCAL=1\n");
		expect(loadEnvVariables({ rootDir: root, processEnv: {} }).variables).toEqual({ LOCAL: "1" });
	});

	it("reads an explicit env file and fails when it is missing", async () => {
		await writeFile(join(root, "custom.env"), "CUSTOM=1\n");
		expect(
			loadEnvVariables({ rootDir: root, envFile: "custom.env", processEnv: {} }).variables,
		).toEqual({
			CUSTOM: "1",
		});
		expect(() => loadEnvVariables({ rootDir: root, envFile: "nope.env", processEnv: {} })).toThrow(
			expect.objectContaining({ code: "E_ENV_FILE_NOT_FOUND" }),
		);
	});

	it("returns only REMOTION_ variables without a file", () => {
		expect(loadEnvVariables({ rootDir: root, processEnv: { PATH: "/bin" } })).toEqual({
			variables: {},
			file: null,
		});
	});
});
