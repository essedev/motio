import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CliIo, defaultDeps } from "@motiojs/cli";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createMotio } from "./index.js";

let cwd: string;
beforeEach(async () => {
	cwd = await mkdtemp(join(tmpdir(), "create-motio-"));
});
afterEach(() => rm(cwd, { recursive: true, force: true }));

it("creates a project the way motio init does", async () => {
	const out: string[] = [];
	const io: CliIo = {
		stdout: (text) => void out.push(text),
		stderr: () => {},
		cwd,
		env: { npm_config_user_agent: "npm/11.0.0 node/v22.0.0" },
		isTTY: false,
	};
	const code = await createMotio(
		["clip", "--template", "blank", "--no-install", "--json"],
		io,
		defaultDeps(io.env),
	);
	expect(code).toBe(0);
	expect(JSON.parse(out[0] as string)).toMatchObject({
		ok: true,
		command: "init",
		template: "blank",
		packageManager: "npm",
		nextSteps: ["cd clip", "npm install", "npm run dev"],
	});
	expect(existsSync(join(cwd, "clip/src/Main.tsx"))).toBe(true);
});
