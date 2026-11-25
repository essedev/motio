// Sets the version of every public package (they move in lockstep) and the VERSION constant of
// `@motiojs/core`, which `@motiojs/motio` re-exports and a test keeps equal to the packages.
// Starters need nothing: `motio init` pins Motio packages to the version of the CLI that runs it.
//
// Usage: node tools/release/version.ts <version>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { publicPackages, REPO } from "./packages.ts";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
export const CORE_VERSION_FILE = join(REPO, "packages", "core", "src", "version.ts");

function main() {
	const [version] = process.argv.slice(2);
	if (!version || !SEMVER.test(version)) {
		throw new Error("Usage: node tools/release/version.ts <version> (for example 0.2.0)");
	}
	for (const pkg of publicPackages()) {
		const file = join(pkg.path, "package.json");
		const text = readFileSync(file, "utf8");
		// Only the top-level "version" field, keeping the file's formatting.
		const next = text.replace(/^(\t"version": )"[^"]*"/m, `$1"${version}"`);
		if (next === text && pkg.manifest.version !== version) {
			throw new Error(`No top-level "version" field found in ${file}.`);
		}
		writeFileSync(file, next);
	}
	const core = readFileSync(CORE_VERSION_FILE, "utf8");
	const nextCore = core.replace(
		/export const VERSION = "[^"]*";/,
		`export const VERSION = "${version}";`,
	);
	if (!nextCore.includes(`export const VERSION = "${version}";`)) {
		throw new Error(`No VERSION constant found in ${CORE_VERSION_FILE}.`);
	}
	writeFileSync(CORE_VERSION_FILE, nextCore);
	console.log(`Every public package and @motiojs/core's VERSION are now ${version}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		main();
	} catch (err) {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	}
}
