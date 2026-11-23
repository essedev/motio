import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { relative } from "node:path";
import { MotioError } from "@motiojs/compat";
import { Flags, parseCommandArgs } from "../args.js";
import type { CommandContext, CommandResult } from "../context.js";
import { usageError } from "../errors.js";
import { BASE_FLAGS } from "../flags.js";
import {
	detectPackageManager,
	PACKAGE_MANAGERS,
	type PackageManager,
	packageManagerCommands,
} from "../init/package-manager.js";
import { type Prompter, terminalPrompter } from "../init/prompt.js";
import { isValidPackageName, packageNameFrom, scaffold } from "../init/scaffold.js";
import { DEFAULT_STARTER, findStarter, STARTERS } from "../init/starters.js";
import { resolvePath } from "../options.js";

export const INIT_FLAGS = {
	...BASE_FLAGS,
	template: {
		type: "string",
		short: "t",
		description: `Starter: ${STARTERS.map((s) => s.name).join(", ")} (default ${DEFAULT_STARTER}).`,
	},
	pm: {
		type: "string",
		description: `Package manager: ${PACKAGE_MANAGERS.join(", ")} (default: the one running motio, else pnpm).`,
	},
	name: { type: "string", description: "Package name (default: from the directory name)." },
	install: {
		type: "boolean",
		description: "Install the dependencies (default; --no-install skips).",
	},
	yes: { type: "boolean", short: "y", description: "Ask nothing: defaults for what flags omit." },
	force: {
		type: "boolean",
		description: "Write into a non-empty directory, replacing files with the same names.",
	},
} as const;

/** Directory used when none is given and nothing can be asked. */
const DEFAULT_DIR = "my-video";

/** Entries that do not make a directory "non-empty" (a fresh `git init`, Finder metadata). */
const IGNORED_ENTRIES = new Set([".git", ".DS_Store"]);

export interface InstallResult {
	/** Exit code, or null when the package manager could not be started. */
	code: number | null;
	/** Combined stdout and stderr. */
	output: string;
	/** Set when the package manager could not be started (not installed...). */
	spawnError?: string;
}

/** What `init` needs beyond the common context; injectable for tests. */
export interface InitDeps {
	/** True when questions can be asked: stdin and stderr are terminals. */
	canPrompt: () => boolean;
	prompter: () => Prompter;
	/** Runs `<pm> install` in `dir`, forwarding output as it arrives. */
	install: (
		pm: PackageManager,
		dir: string,
		onOutput: (text: string) => void,
	) => Promise<InstallResult>;
}

function spawnInstall(
	pm: PackageManager,
	dir: string,
	onOutput: (text: string) => void,
): Promise<InstallResult> {
	return new Promise((resolve) => {
		const child = spawn(pm, ["install"], {
			cwd: dir,
			stdio: ["ignore", "pipe", "pipe"],
			// npm, yarn and pnpm are .cmd shims on Windows, which spawn only runs through a shell.
			shell: process.platform === "win32",
		});
		let output = "";
		const collect = (chunk: Buffer) => {
			const text = chunk.toString();
			output += text;
			onOutput(text);
		};
		child.stdout.on("data", collect);
		child.stderr.on("data", collect);
		child.on("error", (error) => resolve({ code: null, output, spawnError: error.message }));
		child.on("close", (code) => resolve({ code, output }));
	});
}

export const defaultInitDeps: InitDeps = {
	canPrompt: () => process.stdin.isTTY === true && process.stderr.isTTY === true,
	prompter: () => terminalPrompter(),
	install: spawnInstall,
};

/** Entries of `dir` that make it non-empty; an empty list when it is missing or empty. */
async function blockingEntries(dir: string): Promise<string[]> {
	if (!existsSync(dir)) return [];
	if (!statSync(dir).isDirectory()) {
		throw new MotioError("E_INIT_TARGET_NOT_DIRECTORY", `${dir} exists and is not a directory.`, {
			path: dir,
		});
	}
	return (await readdir(dir)).filter((entry) => !IGNORED_ENTRIES.has(entry)).sort();
}

/** The last lines of a long output, for an error message. */
function tail(text: string, lines = 20): string {
	return text.trimEnd().split("\n").slice(-lines).join("\n");
}

/** Builds `motio init` with its dependencies; `initCommand` uses the real terminal and spawn. */
export function createInitCommand(deps: InitDeps) {
	return async function initCommand(
		ctx: CommandContext,
		argv: readonly string[],
	): Promise<CommandResult> {
		const { positionals, values } = parseCommandArgs(argv, INIT_FLAGS);
		const flags = new Flags(values);
		if (positionals.length > 1) {
			throw usageError(`Too many arguments: ${positionals.join(" ")}. Pass one directory.`, {
				positionals,
			});
		}
		const templateFlag = flags.oneOf(
			"template",
			STARTERS.map((s) => s.name),
		);
		const pmFlag = flags.oneOf("pm", PACKAGE_MANAGERS);
		const nameFlag = flags.string("name");
		if (nameFlag !== undefined && !isValidPackageName(nameFlag)) {
			throw usageError(
				`--name must be a valid npm package name (lower case, no spaces); got "${nameFlag}".`,
				{ flag: "name", value: nameFlag },
			);
		}
		const install = flags.boolean("install") ?? true;
		const force = flags.boolean("force") ?? false;
		const interactive = !ctx.reporter.json && flags.boolean("yes") !== true && deps.canPrompt();

		const prompter = interactive ? deps.prompter() : null;
		let dirArgument = positionals[0];
		let template = templateFlag;
		let pm = pmFlag;
		try {
			if (prompter && dirArgument === undefined) {
				dirArgument = await prompter.text("Project directory", DEFAULT_DIR);
			}
			if (prompter && template === undefined) {
				template = await prompter.select(
					"Starter",
					STARTERS.map((s) => ({ value: s.name, label: s.name, hint: s.description })),
					DEFAULT_STARTER,
				);
			}
			if (prompter && pm === undefined) {
				pm = await prompter.select(
					"Package manager",
					PACKAGE_MANAGERS.map((value) => ({ value, label: value })),
					detectPackageManager(ctx.io.env) ?? "pnpm",
				);
			}
		} finally {
			prompter?.close();
		}

		const dir = resolvePath(ctx.io.cwd, dirArgument ?? DEFAULT_DIR);
		const starter = findStarter(template ?? DEFAULT_STARTER);
		if (!starter) throw new Error(`Starter ${template} is listed but not defined.`);
		const packageManager = pm ?? detectPackageManager(ctx.io.env) ?? "pnpm";
		const name = nameFlag ?? packageNameFrom(dir);

		const existing = await blockingEntries(dir);
		if (existing.length > 0 && !force) {
			throw new MotioError(
				"E_INIT_DIRECTORY_NOT_EMPTY",
				`${dir} is not empty (${existing.slice(0, 5).join(", ")}${existing.length > 5 ? ", ..." : ""}). Choose another directory, or pass --force to write into it (files with the same names are replaced).`,
				{ path: dir, entries: existing },
			);
		}

		const files = await scaffold({ dir, starter, name, pm: packageManager });
		ctx.reporter.info(`Created ${name} from the ${starter.name} starter in ${dir}`);

		const commands = packageManagerCommands(packageManager);
		if (install) {
			ctx.reporter.info(`Running ${commands.install} ...`);
			const result = await deps.install(packageManager, dir, (text) => {
				if (!ctx.reporter.json) ctx.io.stderr(text);
			});
			if (result.spawnError !== undefined) {
				throw new MotioError(
					"E_PACKAGE_MANAGER_NOT_FOUND",
					`Could not run ${packageManager}: ${result.spawnError}. Install it, or pick another with --pm. The project files are written; install the dependencies yourself.`,
					{ packageManager, path: dir },
				);
			}
			if (result.code !== 0) {
				throw new MotioError(
					"E_INSTALL_FAILED",
					`${commands.install} failed with exit code ${result.code} in ${dir}. The project files are written; fix the error and run it again.\n${tail(result.output)}`,
					{ packageManager, path: dir, exitCode: result.code },
				);
			}
		}

		const relativeDir = relative(ctx.io.cwd, dir);
		const nextSteps = [
			...(relativeDir === ""
				? []
				: [`cd ${relativeDir.includes(" ") ? `"${relativeDir}"` : relativeDir}`]),
			...(install ? [] : [commands.install]),
			`${commands.run} dev`,
		];
		return {
			json: {
				dir,
				name,
				template: starter.name,
				packageManager,
				installed: install,
				files,
				nextSteps,
			},
			human: [
				"",
				`Done. Next:`,
				...nextSteps.map((step) => `  ${step}`),
				"",
				`${commands.run} render renders ${starter.render.output}; ${commands.run} still renders ${starter.still.output}.`,
			],
		};
	};
}

/** `motio init [dir]` */
export const initCommand = createInitCommand(defaultInitDeps);
