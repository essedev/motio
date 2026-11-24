import { existsSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CommandContext, defaultDeps } from "../index.js";
import { detectPackageManager, PACKAGE_MANAGERS } from "../init/package-manager.js";
import { type Prompter, terminalPrompter } from "../init/prompt.js";
import {
	alignCodeComments,
	fillPlaceholders,
	isValidPackageName,
	packageNameFrom,
	scaffold,
} from "../init/scaffold.js";
import { STARTERS, STARTERS_DIR } from "../init/starters.js";
import { Reporter } from "../io.js";
import { runCli } from "../main.js";
import { type TestIo, testIo, validator } from "../test-support/fakes.js";
import { createInitCommand, type InitDeps, type InstallResult } from "./init.js";

const validate = validator();
let cwd: string;
beforeEach(async () => {
	cwd = await mkdtemp(join(tmpdir(), "motio-init-"));
});
afterEach(() => rm(cwd, { recursive: true, force: true }));

function parseJson(io: TestIo): Record<string, unknown> {
	expect(io.out).toHaveLength(1);
	const result = JSON.parse(io.out[0] as string) as Record<string, unknown>;
	expect(validate("init", result), JSON.stringify(result)).toBeNull();
	return result;
}

/** Runs the real `motio init` through the CLI; only `--no-install` keeps it offline. */
async function cli(argv: string[]) {
	const io = testIo(cwd);
	const code = await runCli(["init", ...argv], io, defaultDeps(io.env));
	return { io, code };
}

/** A prompter that answers from a list and records the questions. */
function scriptedPrompter(answers: string[]): { prompter: Prompter; asked: string[] } {
	const asked: string[] = [];
	const next = (question: string, initial: string) => {
		asked.push(question);
		const answer = answers.shift();
		return answer === undefined || answer === "" ? initial : answer;
	};
	return {
		asked,
		prompter: {
			text: async (question, initial) => next(question, initial),
			select: async (question, _choices, initial) => next(question, initial) as typeof initial,
			close: () => {},
		},
	};
}

/** Runs `initCommand` with fake prompts and install, as the CLI would. */
async function runInit(
	argv: string[],
	options: {
		canPrompt?: boolean;
		answers?: string[];
		install?: InstallResult;
		env?: Record<string, string | undefined>;
		json?: boolean;
	} = {},
) {
	const io = testIo(cwd);
	io.env = options.env ?? {};
	const installs: Array<{ pm: string; dir: string }> = [];
	const { prompter, asked } = scriptedPrompter(options.answers ?? []);
	const deps: InitDeps = {
		canPrompt: () => options.canPrompt ?? false,
		prompter: () => prompter,
		install: async (pm, dir, onOutput) => {
			installs.push({ pm, dir });
			onOutput("installing\n");
			return options.install ?? { code: 0, output: "installing\n" };
		},
	};
	const ctx: CommandContext = {
		...defaultDeps(io.env),
		io,
		reporter: new Reporter(io, options.json ?? false),
		cleanup: [],
	};
	const result = await createInitCommand(deps)(ctx, argv);
	return { io, result, installs, asked };
}

describe("motio init", () => {
	it("writes every starter with its scripts and the Motio packages, and validates against the schema", async () => {
		for (const starter of STARTERS) {
			const { io, code } = await cli([
				starter.name,
				"--template",
				starter.name,
				"--pm",
				"pnpm",
				"--no-install",
				"--json",
			]);
			expect(code).toBe(0);
			const result = parseJson(io);
			const dir = join(cwd, starter.name);
			expect(result).toMatchObject({
				dir,
				name: starter.name,
				template: starter.name,
				packageManager: "pnpm",
				installed: false,
				nextSteps: [`cd ${starter.name}`, "pnpm install", "pnpm dev"],
			});
			const files = result.files as string[];
			expect(files).toEqual(expect.arrayContaining([".gitignore", "package.json", "README.md"]));
			expect(files).toEqual(
				expect.arrayContaining(["src/index.ts", "src/Root.tsx", "tsconfig.json"]),
			);
			for (const file of files) expect(existsSync(join(dir, file)), file).toBe(true);

			const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
			expect(Object.keys(pkg.scripts)).toEqual(
				expect.arrayContaining(["dev", "render", "still", "typecheck"]),
			);
			expect(pkg.scripts.render).toBe(
				`motio render src/index.ts ${starter.render.composition} ${starter.render.output}`,
			);
			expect(pkg.dependencies.motio).toBe("^0.0.0");
			expect(pkg.devDependencies["@motiojs/cli"]).toBe("^0.0.0");
			for (const name of starter.packages) expect(pkg.dependencies[name]).toBe("^0.0.0");

			const readme = await readFile(join(dir, "README.md"), "utf8");
			expect(readme).toContain(`# ${starter.name}`);
			expect(readme).not.toMatch(/\{\{\w+\}\}/);
		}
	});

	it("never generates code that imports remotion", async () => {
		for (const starter of STARTERS) {
			const files = readdirSync(join(STARTERS_DIR, starter.name), { recursive: true }).map(String);
			for (const file of files.filter((f) => /\.(ts|tsx)$/.test(f))) {
				const text = await readFile(join(STARTERS_DIR, starter.name, file), "utf8");
				expect(text, `${starter.name}/${file}`).not.toMatch(/from "(@remotion\/|remotion)/);
			}
		}
	});

	it("refuses a non-empty directory unless --force, and --force keeps the other files", async () => {
		const dir = join(cwd, "taken");
		await mkdir(join(dir, ".git"), { recursive: true });
		await writeFile(join(dir, "notes.txt"), "mine");
		const refused = await cli(["taken", "--yes", "--no-install", "--json"]);
		expect(refused.code).toBe(1);
		const error = JSON.parse(refused.io.out[0] as string);
		expect(validate("init", error)).toBeNull();
		expect(error.error.code).toBe("E_INIT_DIRECTORY_NOT_EMPTY");
		expect(error.error.context.entries).toEqual(["notes.txt"]);
		expect(existsSync(join(dir, "package.json"))).toBe(false);

		const forced = await cli(["taken", "--yes", "--no-install", "--force", "--json"]);
		expect(forced.code).toBe(0);
		expect(await readFile(join(dir, "notes.txt"), "utf8")).toBe("mine");
		expect(existsSync(join(dir, "src/Root.tsx"))).toBe(true);
	});

	it("accepts a directory holding only .git", async () => {
		await mkdir(join(cwd, "repo/.git"), { recursive: true });
		expect((await cli(["repo", "--yes", "--no-install", "--json"])).code).toBe(0);
	});

	it("rejects bad arguments with exit code 2", async () => {
		for (const argv of [
			["--template", "nope"],
			["--pm", "deno"],
			["--name", "Not Valid"],
			["a", "b"],
		]) {
			const { io, code } = await cli([...argv, "--no-install", "--json"]);
			expect(code, argv.join(" ")).toBe(2);
			expect(JSON.parse(io.out[0] as string).error.code).toBe("E_INVALID_ARGUMENT");
		}
	});

	it("rejects a target that is a file", async () => {
		await writeFile(join(cwd, "file"), "");
		const { io, code } = await cli(["file", "--yes", "--no-install", "--json"]);
		expect(code).toBe(1);
		expect(JSON.parse(io.out[0] as string).error.code).toBe("E_INIT_TARGET_NOT_DIRECTORY");
	});

	it("uses the defaults without a terminal: my-video, basic, the package manager running it", async () => {
		const { result, installs, asked } = await runInit([], {
			env: { npm_config_user_agent: "npm/11.0.0 node/v22.0.0 darwin arm64" },
		});
		expect(asked).toEqual([]);
		expect(result.json).toMatchObject({
			dir: join(cwd, "my-video"),
			name: "my-video",
			template: "basic",
			packageManager: "npm",
			installed: true,
			nextSteps: ["cd my-video", "npm run dev"],
		});
		expect(installs).toEqual([{ pm: "npm", dir: join(cwd, "my-video") }]);
	});

	it("asks for what the flags omit on a terminal", async () => {
		const { result, asked } = await runInit(["--pm", "bun"], {
			canPrompt: true,
			answers: ["clip", "captions"],
		});
		expect(asked).toEqual(["Project directory", "Starter"]);
		expect(result.json).toMatchObject({
			template: "captions",
			packageManager: "bun",
			name: "clip",
		});
		expect(existsSync(join(cwd, "clip/public/captions.json"))).toBe(true);
	});

	it("asks nothing with --yes or --json", async () => {
		for (const flag of ["--yes", "--json"]) {
			await rm(join(cwd, "my-video"), { recursive: true, force: true });
			const { asked } = await runInit([flag], { canPrompt: true, json: flag === "--json" });
			expect(asked).toEqual([]);
		}
	});

	it("streams install output in human mode and keeps stdout for the result", async () => {
		const { io, result } = await runInit(["v", "--yes"]);
		expect(io.err.join("")).toContain("installing");
		expect(io.out).toEqual([]);
		expect(result.human.join("\n")).toContain("pnpm dev");
	});

	it("reports a failed install with the tail of its output and keeps the files", async () => {
		await expect(
			runInit(["v", "--yes"], { install: { code: 1, output: "ERR_PNPM_FETCH_404\n" } }),
		).rejects.toMatchObject({
			code: "E_INSTALL_FAILED",
			message: expect.stringContaining("ERR_PNPM_FETCH_404"),
		});
		expect(existsSync(join(cwd, "v/package.json"))).toBe(true);
	});

	it("reports a package manager that cannot start", async () => {
		await expect(
			runInit(["v", "--yes", "--pm", "yarn"], {
				install: { code: null, output: "", spawnError: "spawn yarn ENOENT" },
			}),
		).rejects.toMatchObject({ code: "E_PACKAGE_MANAGER_NOT_FOUND" });
	});

	it("writes into the current directory with '.' and prints no cd step", async () => {
		const { result } = await runInit([".", "--yes", "--no-install"]);
		expect(result.json.nextSteps).toEqual(["pnpm install", "pnpm dev"]);
		expect(existsSync(join(cwd, "src/index.ts"))).toBe(true);
	});
});

describe("init helpers", () => {
	it("derives package names from directories", () => {
		expect(packageNameFrom("/a/My Video!")).toBe("my-video");
		expect(packageNameFrom("/a/_x")).toBe("x");
		expect(packageNameFrom("/")).toBe("my-video");
		expect(isValidPackageName("@me/clip")).toBe(true);
		expect(isValidPackageName("Clip")).toBe(false);
	});

	it("reads the package manager from the user agent", () => {
		expect(detectPackageManager({ npm_config_user_agent: "pnpm/11.29.0 npm/? node/v26" })).toBe(
			"pnpm",
		);
		expect(detectPackageManager({ npm_config_user_agent: "yarn/4.1.0 npm/?" })).toBe("yarn");
		expect(detectPackageManager({ npm_config_user_agent: "deno/2" })).toBeNull();
		expect(detectPackageManager({})).toBeNull();
	});

	it("fills README placeholders per package manager", () => {
		const text = "{{install}} | {{run}} dev | {{exec}} motio | {{add}} x | {{unknown}}";
		expect(fillPlaceholders(text, "n", "npm")).toBe(
			"npm install | npm run dev | npx motio | npm install -D x | {{unknown}}",
		);
		expect(fillPlaceholders(text, "n", "bun")).toBe(
			"bun install | bun run dev | bunx motio | bun add -d x | {{unknown}}",
		);
	});

	it("aligns the README command comments for every package manager and starter", async () => {
		const root = await mkdtemp(join(tmpdir(), "motio-readme-"));
		try {
			for (const starter of STARTERS) {
				for (const pm of PACKAGE_MANAGERS) {
					const dir = join(root, `${starter.name}-${pm}`);
					await scaffold({ dir, starter, name: "demo", pm, version: "0.0.0" });
					const readme = await readFile(join(dir, "README.md"), "utf8");
					const block = /```bash\n([\s\S]*?)```/.exec(readme)?.[1] ?? "";
					const lines = block.trimEnd().split("\n");
					expect(lines.length, `${starter.name} ${pm}`).toBeGreaterThan(1);
					const columns = lines.map((line) => line.indexOf(" # ") + 1);
					const longest = Math.max(...lines.map((line) => line.split(/\s+#/)[0]?.length ?? 0));
					expect(new Set(columns), `${starter.name} ${pm}:\n${block}`).toEqual(
						new Set([longest + 2]),
					);
				}
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("aligns comments only inside code blocks, per run of commented lines", () => {
		const text = [
			"a  # not code",
			"```bash",
			"pnpm # one",
			"pnpm install   # two",
			"",
			"x # three",
			"echo '#'",
			"```",
		].join("\n");
		expect(alignCodeComments(text).split("\n")).toEqual([
			"a  # not code",
			"```bash",
			"pnpm          # one",
			"pnpm install  # two",
			"",
			"x  # three",
			"echo '#'",
			"```",
		]);
	});

	it("prompts on a stream: numbers, names, defaults, retries, and closed input", async () => {
		const input = new PassThrough();
		const output = new PassThrough();
		let written = "";
		output.on("data", (chunk: Buffer) => {
			written += chunk.toString();
		});
		const prompter = terminalPrompter(input, output);
		const choices = [
			{ value: "a", label: "a" },
			{ value: "b", label: "b", hint: "second" },
		] as const;
		input.write("\n2\nzzz\nb\n");
		expect(await prompter.text("Dir", "my-video")).toBe("my-video");
		expect(await prompter.select("Pick", choices, "a")).toBe("b");
		expect(await prompter.select("Pick", choices, "a")).toBe("b");
		expect(written).toContain('"zzz" is not one of the choices.');
		expect(written).toContain("2. b  second");
		input.end();
		await expect(prompter.text("Dir", "x")).rejects.toMatchObject({ code: "E_PROMPT_CLOSED" });
		prompter.close();
	});
});
