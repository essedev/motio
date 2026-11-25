// Publishes every public package to npm, in dependency order, skipping the versions the registry
// already has, so a run that failed halfway can simply be run again. The release workflow
// (.github/workflows/release.yml) runs it with npm's trusted publishing (OIDC, provenance
// attached by npm); the one-time first publish runs it from a clone with a short-lived token in
// NPM_TOKEN (CONTRIBUTING.md, "Releases").
//
// Every package is packed with `pnpm pack`, which applies its `files` list and turns `workspace:`
// ranges into the released version, and every tarball is checked before anything is published:
// the version, no workspace, link, file or catalog range left, LICENSE and NOTICE inside. The
// tarball is then published with `npm publish`, which owns trusted publishing.
//
// Usage: node tools/release/publish.ts [--dry-run] [--expect-version <version|tag>] [--no-build]
// The token, when used, is read from the environment only: it is never written to disk (npm
// reads it through a `${NPM_TOKEN}` reference in a temporary npmrc) and never printed.
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { lockstepVersion, type Manifest, publicPackages, publishOrder, REPO } from "./packages.ts";

/** npm's trusted publishing needs 11.5.1 or later. */
const MIN_NPM_FOR_OIDC = [11, 5, 1] as const;

interface Result {
	code: number | null;
	stdout: string;
	stderr: string;
}

function run(
	command: string,
	args: readonly string[],
	options: { cwd: string; env?: NodeJS.ProcessEnv; echo?: boolean },
): Promise<Result> {
	return new Promise((done, fail) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: options.env ?? process.env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
			if (options.echo) process.stdout.write(chunk);
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
			if (options.echo) process.stderr.write(chunk);
		});
		child.on("error", fail);
		child.on("close", (code) => done({ code, stdout, stderr }));
	});
}

async function mustRun(
	command: string,
	args: readonly string[],
	options: { cwd: string; env?: NodeJS.ProcessEnv; echo?: boolean },
): Promise<Result> {
	const result = await run(command, args, options);
	if (result.code !== 0) {
		throw new Error(
			`${command} ${args.join(" ")} failed in ${options.cwd} (exit ${result.code}).\n${result.stderr}`,
		);
	}
	return result;
}

/** Whether `version` (x.y.z, anything after ignored) is at least `min`. */
export function atLeast(version: string, min: readonly [number, number, number]): boolean {
	const parts = version.split(/[.-]/).map(Number);
	for (let i = 0; i < 3; i++) {
		const part = parts[i] ?? 0;
		if (part !== min[i]) return part > (min[i] as number);
	}
	return true;
}

/**
 * The versions of `name` on the registry: none when the package does not exist yet (E404); any
 * other failure (network, registry) stops the release rather than guessing.
 */
async function registryVersions(name: string, env: NodeJS.ProcessEnv): Promise<Set<string>> {
	const result = await run("npm", ["view", name, "versions", "--json"], { cwd: tmpdir(), env });
	const parsed = parseJson(result.stdout);
	if (result.code === 0) {
		if (typeof parsed === "string") return new Set([parsed]);
		if (Array.isArray(parsed)) return new Set(parsed.map(String));
		return new Set();
	}
	const code = (parsed as { error?: { code?: string } } | undefined)?.error?.code;
	if (code === "E404") return new Set();
	throw new Error(
		`npm view ${name} failed (exit ${result.code}).\n${result.stdout}${result.stderr}`,
	);
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

const LOCAL_RANGE = /^(workspace|link|file|catalog|portal):/;

/** What is wrong with a packed tarball: its manifest and the files a release must carry. */
export function tarballProblems(
	expected: { name: string; version: string },
	manifest: Manifest & { devDependencies?: Record<string, string> },
	files: readonly string[],
): string[] {
	const problems: string[] = [];
	if (manifest.name !== expected.name) problems.push(`name is ${manifest.name}`);
	if (manifest.version !== expected.version) problems.push(`version is ${manifest.version}`);
	for (const field of [
		"dependencies",
		"peerDependencies",
		"optionalDependencies",
		"devDependencies",
	] as const) {
		for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
			if (LOCAL_RANGE.test(range)) problems.push(`${field}.${dep} is ${range}`);
		}
	}
	for (const required of ["package/LICENSE", "package/NOTICE", "package/package.json"]) {
		if (!files.includes(required)) problems.push(`${required.slice("package/".length)} is missing`);
	}
	return problems;
}

/** Why `@motiojs/ffmpeg` cannot be published from this manifest, or null. */
export function ffmpegReleaseProblem(manifest: {
	RELEASE_PUBLISHED: boolean;
	RELEASE_TAG: string;
}): string | null {
	return manifest.RELEASE_PUBLISHED
		? null
		: `@motiojs/ffmpeg has RELEASE_PUBLISHED = false: publish the GitHub release ${manifest.RELEASE_TAG}, run tools/ffmpeg-build/update-manifest.mjs on its archives and set RELEASE_PUBLISHED to true in packages/ffmpeg/src/manifest.ts first (D-065).`;
}

/** The npm configuration of this run: a token from NPM_TOKEN, or whatever npm finds itself. */
async function authEnvironment(): Promise<{
	env: NodeJS.ProcessEnv;
	cleanup: () => Promise<void>;
}> {
	if (!process.env.NPM_TOKEN) return { env: process.env, cleanup: async () => {} };
	const dir = await mkdtemp(join(tmpdir(), "motio-release-npmrc-"));
	const npmrc = join(dir, "npmrc");
	// The literal `${NPM_TOKEN}` is expanded by npm from the environment: the file holds no secret.
	await writeFile(
		npmrc,
		// biome-ignore lint/suspicious/noTemplateCurlyInString: npm expands it, not JavaScript.
		"registry=https://registry.npmjs.org/\n//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n",
		{ mode: 0o600 },
	);
	return {
		env: { ...process.env, npm_config_userconfig: npmrc },
		cleanup: () => rm(dir, { recursive: true, force: true }),
	};
}

async function main() {
	const { values } = parseArgs({
		options: {
			"dry-run": { type: "boolean", default: false },
			"expect-version": { type: "string" },
			"no-build": { type: "boolean", default: false },
		},
	});
	const dryRun = values["dry-run"];
	const packages = publishOrder(publicPackages());
	const version = lockstepVersion(packages);
	// A tag name (v0.1.0) or a bare version.
	const expected = values["expect-version"]?.replace(/^v/, "");
	if (expected !== undefined && expected !== version) {
		throw new Error(
			`The packages are at ${version}, but this release is ${expected}: bump them with node tools/release/version.ts first.`,
		);
	}

	const npmVersion = (await mustRun("npm", ["--version"], { cwd: REPO })).stdout.trim();
	const ci = process.env.GITHUB_ACTIONS === "true";
	if (ci && !process.env.NPM_TOKEN) {
		if (!atLeast(npmVersion, MIN_NPM_FOR_OIDC)) {
			throw new Error(`Trusted publishing needs npm 11.5.1 or later; this is npm ${npmVersion}.`);
		}
		if (!dryRun && !process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
			throw new Error(
				"No OIDC token in this job: the workflow needs `permissions: id-token: write` to publish.",
			);
		}
	}
	console.log(
		`Motio ${version}: ${packages.length} packages, npm ${npmVersion}${dryRun ? ", dry run" : ""}.`,
	);

	if (!values["no-build"]) {
		console.log("Building (pnpm build)...");
		await mustRun("pnpm", ["build"], { cwd: REPO });
	}

	const { env, cleanup } = await authEnvironment();
	const work = await mkdtemp(join(tmpdir(), "motio-release-"));
	try {
		// Which packages still need this version: asked before packing, so a rerun after a
		// partial failure only touches the rest.
		const pending: typeof packages = [];
		for (const pkg of packages) {
			const versions = await registryVersions(pkg.manifest.name, env);
			if (versions.has(version)) console.log(`skip     ${pkg.manifest.name}@${version} (on npm)`);
			else pending.push(pkg);
		}
		if (pending.length === 0) {
			console.log(`Every package is already published at ${version}.`);
			return;
		}

		// @motiojs/ffmpeg reaches npm only once its FFmpeg release is published and its manifest
		// carries that release's digests (D-065), so it works from its first version.
		if (pending.some((pkg) => pkg.manifest.name === "@motiojs/ffmpeg")) {
			const manifest = (await import(
				pathToFileURL(join(REPO, "packages", "ffmpeg", "dist", "manifest.js")).href
			)) as { RELEASE_PUBLISHED: boolean; RELEASE_TAG: string };
			const problem = ffmpegReleaseProblem(manifest);
			if (problem && !dryRun) throw new Error(`${problem} Nothing was published.`);
			if (problem) console.log(`warning: ${problem} A real run would stop here.`);
		}

		// Pack and check every tarball before the first publish.
		const tarballs = new Map<string, string>();
		for (const pkg of pending) {
			const destination = join(work, pkg.dir);
			await mustRun("pnpm", ["pack", "--pack-destination", destination], { cwd: pkg.path });
			const [file] = (await readdir(destination)).filter((f) => f.endsWith(".tgz"));
			if (!file) throw new Error(`pnpm pack wrote no tarball for ${pkg.manifest.name}.`);
			const tarball = join(destination, file);
			const listing = await mustRun("tar", ["-tzf", tarball], { cwd: work });
			const packed = await mustRun("tar", ["-xzOf", tarball, "package/package.json"], {
				cwd: work,
			});
			const problems = tarballProblems(
				{ name: pkg.manifest.name, version },
				JSON.parse(packed.stdout),
				listing.stdout.split("\n").filter(Boolean),
			);
			if (problems.length > 0) {
				throw new Error(`${pkg.manifest.name}: ${problems.join("; ")}. Nothing was published.`);
			}
			tarballs.set(pkg.manifest.name, tarball);
		}

		const published: string[] = [];
		for (const pkg of pending) {
			const tarball = tarballs.get(pkg.manifest.name) as string;
			const args = ["publish", tarball, "--access", "public"];
			// A prerelease never becomes `latest`.
			if (version.includes("-")) args.push("--tag", "next");
			if (dryRun) args.push("--dry-run");
			console.log(`${dryRun ? "dry-run" : "publish"}  ${pkg.manifest.name}@${version}`);
			const result = await run("npm", args, { cwd: work, env });
			if (result.code !== 0) {
				const done = published.length > 0 ? ` Published before it: ${published.join(", ")}.` : "";
				throw new Error(
					`npm publish ${pkg.manifest.name}@${version} failed (exit ${result.code}).${done} Run the release again to publish the rest.\n${result.stderr}`,
				);
			}
			// npm's own summary of the tarball (`package size`, `unpacked size`, `total files`).
			const sizes = result.stderr
				.split("\n")
				.map((line) => /npm notice (package size|unpacked size|total files):\s*(.+)$/.exec(line))
				.filter((match) => match !== null)
				.map((match) => `${match[1]} ${match[2]}`);
			if (sizes.length > 0) console.log(`         ${sizes.join(", ")}`);
			published.push(pkg.manifest.name);
		}
		console.log(
			`${dryRun ? "Would publish" : "Published"} ${published.length} packages at ${version}; ${packages.length - pending.length} were already on npm.`,
		);
	} finally {
		await rm(work, { recursive: true, force: true });
		await cleanup();
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main().catch((err: unknown) => {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	});
}
