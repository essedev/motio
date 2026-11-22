import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { splitSpecifier } from "@motiojs/compat";

type ExportsField = string | { [condition: string]: ExportsField | undefined } | undefined;

function pickExport(field: ExportsField): string | undefined {
	if (typeof field === "string" || field === undefined) return field;
	for (const condition of ["import", "module", "default"]) {
		const picked = pickExport(field[condition]);
		if (picked) return picked;
	}
	return undefined;
}

/**
 * Resolves a bare specifier the way an ES module in `fromDirectory` would. Tries `require`
 * resolution first, then reads the package `exports` for ESM-only packages, whose exports
 * `require.resolve` cannot see. Returns `null` when the package is not installed.
 */
export function resolveModule(specifier: string, fromDirectory: string): string | null {
	const require = createRequire(join(fromDirectory, "noop.js"));
	try {
		return require.resolve(specifier);
	} catch (error) {
		const code = (error as { code?: string }).code;
		if (code !== "ERR_PACKAGE_PATH_NOT_EXPORTED" && code !== "MODULE_NOT_FOUND") throw error;
	}
	const { packageName, subpath } = splitSpecifier(specifier);
	let directory = fromDirectory;
	while (true) {
		const packageDirectory = join(directory, "node_modules", packageName);
		const manifestPath = join(packageDirectory, "package.json");
		if (existsSync(manifestPath)) {
			const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
				exports?: Record<string, ExportsField> | string;
				module?: string;
				main?: string;
			};
			const exportsField = manifest.exports;
			const key = subpath ? `.${subpath}` : ".";
			const target =
				typeof exportsField === "string"
					? subpath
						? undefined
						: exportsField
					: exportsField
						? pickExport(exportsField[key])
						: subpath
							? subpath.slice(1)
							: (manifest.module ?? manifest.main ?? "index.js");
			if (!target) return null;
			const path = join(packageDirectory, target);
			return existsSync(path) ? path : null;
		}
		const parent = dirname(directory);
		if (parent === directory) return null;
		directory = parent;
	}
}

/** Resolves a module from this package's own dependencies (`@motiojs/compat`, `@motiojs/core`). */
export function resolveOwnDependency(specifier: string): string | null {
	return resolveModule(specifier, dirname(fileURLToPath(import.meta.url)));
}
