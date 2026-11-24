import { readFileSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { type PackageManager, packageManagerCommands } from "./package-manager.js";
import { SHARED_DIR, STARTERS_DIR, type Starter } from "./starters.js";

/**
 * Starter files whose name changes when copied: npm drops `.gitignore` from published packages,
 * so it is stored without the dot.
 */
const RENAMED: Readonly<Record<string, string>> = { gitignore: ".gitignore" };

/** Text files whose `{{placeholders}}` are filled in. */
const TEMPLATED = new Set(["README.md", "AGENTS.md"]);

/** Third-party versions the generated project depends on, tested with this release. */
export const THIRD_PARTY_VERSIONS = {
	react: "^19.3.1",
	"react-dom": "^19.3.1",
	"@types/react": "^19.3.0",
	typescript: "^7.0.2",
} as const;

/** The version of this `@motiojs/cli`; every Motio package of a project uses the same one. */
export function motioVersion(): string {
	const manifest = JSON.parse(
		readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
	) as { version: string };
	return manifest.version;
}

/**
 * Turns a directory name into a valid npm package name: lower case, URL-safe characters, no
 * leading dot or underscore.
 */
export function packageNameFrom(dir: string): string {
	const name = basename(dir)
		.toLowerCase()
		.replace(/[^a-z0-9._~-]+/g, "-")
		.replace(/^[._-]+/, "")
		.replace(/-+$/, "");
	return name === "" ? "my-video" : name.slice(0, 214);
}

/** True for a valid unscoped or scoped npm package name. */
export function isValidPackageName(name: string): boolean {
	return (
		/^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/.test(name) && name.length <= 214
	);
}

export interface ScaffoldOptions {
	/** Absolute path of the project directory; created if missing. */
	dir: string;
	starter: Starter;
	/** The package name. */
	name: string;
	pm: PackageManager;
	/** Version of the Motio packages, by default this CLI's. */
	version?: string;
}

/** The generated package.json. */
export function packageJson(options: ScaffoldOptions): Record<string, unknown> {
	const version = `^${options.version ?? motioVersion()}`;
	const { starter } = options;
	const run = (output: { composition: string; output: string; frame?: number }, command: string) =>
		[
			"motio",
			command,
			"src/index.ts",
			output.composition,
			output.output,
			...(output.frame !== undefined ? [`--frame=${output.frame}`] : []),
		].join(" ");
	const motioPackages = Object.fromEntries(
		["@motiojs/motio", ...starter.packages].sort().map((name) => [name, version]),
	);
	return {
		name: options.name,
		version: "0.0.0",
		private: true,
		type: "module",
		scripts: {
			dev: "motio dev src/index.ts",
			render: run(starter.render, "render"),
			still: run(starter.still, "still"),
			typecheck: "tsc",
		},
		dependencies: {
			...motioPackages,
			react: THIRD_PARTY_VERSIONS.react,
			"react-dom": THIRD_PARTY_VERSIONS["react-dom"],
		},
		devDependencies: {
			"@motiojs/cli": version,
			"@types/react": THIRD_PARTY_VERSIONS["@types/react"],
			typescript: THIRD_PARTY_VERSIONS.typescript,
		},
	};
}

/** Fills `{{name}}`, `{{install}}`, `{{run}}`, `{{exec}}` and `{{add}}`. */
export function fillPlaceholders(text: string, name: string, pm: PackageManager): string {
	const commands = packageManagerCommands(pm);
	const values: Record<string, string> = {
		name,
		install: commands.install,
		run: commands.run,
		exec: commands.exec,
		add: commands.addDev,
	};
	return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}

/**
 * Aligns the trailing `# comments` of consecutive command lines in each fenced code block, two
 * spaces after the longest command. The starters' READMEs are aligned for `{{run}}`, which
 * expands to commands of different lengths per package manager (`pnpm`, `npm run`, `bun run`).
 */
export function alignCodeComments(text: string): string {
	const lines = text.split("\n");
	const commented = /^(.*?\S)\s+(# .*)$/;
	let inFence = false;
	for (let i = 0; i < lines.length; i++) {
		if (/^\s*```/.test(lines[i] as string)) {
			inFence = !inFence;
			continue;
		}
		if (!inFence || !commented.test(lines[i] as string)) continue;
		let end = i;
		while (end + 1 < lines.length && commented.test(lines[end + 1] as string)) end++;
		const parts = lines.slice(i, end + 1).map((line) => {
			const [, command, comment] = commented.exec(line) as RegExpExecArray;
			return { command: command as string, comment: comment as string };
		});
		const width = Math.max(...parts.map((p) => p.command.length)) + 2;
		parts.forEach((p, j) => {
			lines[i + j] = `${p.command.padEnd(width)}${p.comment}`;
		});
		i = end;
	}
	return lines.join("\n");
}

async function listFiles(root: string): Promise<string[]> {
	const entries = await readdir(root, { recursive: true, withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => relative(root, join(entry.parentPath, entry.name)))
		.sort();
}

/**
 * Writes the starter into `dir`: the shared files, the starter's own files (which win over shared
 * ones with the same path) and package.json. Returns the written paths, relative to `dir`, sorted.
 */
export async function scaffold(options: ScaffoldOptions): Promise<string[]> {
	const sources = new Map<string, string>();
	for (const from of [SHARED_DIR, options.starter.name]) {
		const root = join(STARTERS_DIR, from);
		for (const file of await listFiles(root)) {
			const target = join(dirname(file), RENAMED[basename(file)] ?? basename(file));
			sources.set(target, join(root, file));
		}
	}
	await mkdir(options.dir, { recursive: true });
	for (const [target, source] of sources) {
		const destination = join(options.dir, target);
		await mkdir(dirname(destination), { recursive: true });
		if (TEMPLATED.has(basename(target))) {
			const text = await readFile(source, "utf8");
			await writeFile(
				destination,
				alignCodeComments(fillPlaceholders(text, options.name, options.pm)),
			);
		} else {
			await copyFile(source, destination);
		}
	}
	await writeFile(
		join(options.dir, "package.json"),
		`${JSON.stringify(packageJson(options), null, "\t")}\n`,
	);
	return [...sources.keys(), "package.json"].sort();
}
