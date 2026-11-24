// `make try`: creates a Motio project from this clone, before the packages are on npm. It packs
// every published workspace package with `pnpm pack` (which applies each package's `files` list
// and rewrites `workspace:` ranges, as publishing does), copies the tarballs into the project and
// points the project at them through pnpm overrides, then runs the clone's `motio init`. The
// project installs exactly what users will install from npm, and `pnpm add @motiojs/<name>` of any
// other Motio package resolves to its tarball too. `--update` repacks into an existing project and
// reinstalls, after a `git pull` for example, without touching its files.
//
// Usage: node tools/try/try.ts <dir> [--template basic|blank|captions] [--update]
// Run `pnpm build` first: the tarballs hold each package's dist/.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const PACKAGES = join(REPO, "packages");
/** Where the tarballs go inside the project, relative to it. */
const TARBALLS = join(".motio", "tarballs");

interface Manifest {
	name: string;
	version: string;
	private?: boolean;
}

/** Every package of `packages/` that is published (not private), with its directory. */
function publishedPackages(): Array<{ dir: string; manifest: Manifest }> {
	return readdirSync(PACKAGES).flatMap((entry) => {
		const file = join(PACKAGES, entry, "package.json");
		if (!existsSync(file)) return [];
		const manifest = JSON.parse(readFileSync(file, "utf8")) as Manifest;
		return manifest.private ? [] : [{ dir: join(PACKAGES, entry), manifest }];
	});
}

function run(command: string, args: readonly string[], cwd: string, quiet = false) {
	return new Promise<void>((done, fail) => {
		const child = spawn(command, args, {
			cwd,
			stdio: quiet ? ["ignore", "ignore", "pipe"] : "inherit",
		});
		let stderr = "";
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.on("error", fail);
		child.on("close", (code) =>
			code === 0
				? done()
				: fail(
						new Error(`${command} ${args.join(" ")} failed in ${cwd} (exit ${code}).\n${stderr}`),
					),
		);
	});
}

/** Packs every published package into `<project>/.motio/tarballs` and returns the overrides. */
async function pack(project: string): Promise<Record<string, string>> {
	const destination = join(project, TARBALLS);
	await rm(destination, { recursive: true, force: true });
	await mkdir(destination, { recursive: true });
	const packages = publishedPackages();
	for (const { dir, manifest } of packages) {
		if (!existsSync(join(dir, "dist"))) {
			throw new Error(`${manifest.name} has no dist/: run pnpm build (make try does) first.`);
		}
	}
	const overrides: Record<string, string> = {};
	await Promise.all(
		packages.map(async ({ dir, manifest }) => {
			await run("pnpm", ["pack", "--pack-destination", destination], dir, true);
			const file = `${manifest.name.replace(/^@/, "").replace("/", "-")}-${manifest.version}.tgz`;
			if (!existsSync(join(destination, file))) throw new Error(`pnpm pack wrote no ${file}.`);
			// Relative to the project, so the project still installs after it is moved.
			overrides[manifest.name] = `file:./${join(TARBALLS, file)}`;
		}),
	);
	return Object.fromEntries(Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b)));
}

/** A pnpm-workspace.yaml that makes the project its own workspace and maps Motio to the tarballs. */
function workspaceFile(overrides: Record<string, string>): string {
	return [
		"# Written by `make try` in the Motio repository: the Motio packages are not on npm yet, so",
		"# they install from the tarballs in .motio/tarballs. Once they are published, delete this",
		"# file and .motio/, then run the install again.",
		"overrides:",
		...Object.entries(overrides).map(([name, spec]) => `  "${name}": "${spec}"`),
		"",
	].join("\n");
}

async function main() {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			template: { type: "string", short: "t", default: "basic" },
			update: { type: "boolean", default: false },
		},
	});
	const [target] = positionals;
	if (!target) throw new Error("Pass the directory to create: make try DIR=../my-video");
	const project = resolve(target);
	const shown = target;

	if (values.update) {
		if (!existsSync(join(project, "pnpm-workspace.yaml"))) {
			throw new Error(`${shown} was not created by make try (no pnpm-workspace.yaml).`);
		}
		console.log(`Packing the Motio packages into ${join(shown, TARBALLS)}...`);
		await writeFile(join(project, "pnpm-workspace.yaml"), workspaceFile(await pack(project)));
		// The tarballs changed under the same names: the lockfile's integrity no longer matches.
		await rm(join(project, "pnpm-lock.yaml"), { force: true });
		await run("pnpm", ["install"], project);
		console.log(`\nUpdated ${shown} to the packages of this clone.`);
		return;
	}

	if (existsSync(project) && (await readdir(project)).some((entry) => entry !== ".git")) {
		throw new Error(
			`${shown} is not empty. Choose a new directory, or run make try-update DIR=${target} to refresh a project made by make try.`,
		);
	}
	await mkdir(project, { recursive: true });
	console.log(`Packing the Motio packages into ${join(shown, TARBALLS)}...`);
	await writeFile(join(project, "pnpm-workspace.yaml"), workspaceFile(await pack(project)));
	// The clone's own CLI writes the starter and installs it; `--force` because the directory
	// already holds the files above.
	await run(
		process.execPath,
		[
			join(PACKAGES, "cli", "dist", "bin.js"),
			"init",
			target,
			"--template",
			values.template,
			"--pm",
			"pnpm",
			"--force",
			"--yes",
		],
		process.cwd(),
	);
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
