import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseSync } from "oxc-parser";
import type { Manifest, SymbolStatus } from "./manifest.js";
import { mapSpecifier, splitSpecifier } from "./mapping.js";

export interface StatusChange {
	specifier: string;
	symbol: string;
	from: SymbolStatus;
	to: SymbolStatus;
}

export interface StatusUpdate {
	manifest: Manifest;
	changes: StatusChange[];
	/** Motio modules that could not be found; their symbols count as not exported. */
	unavailable: string[];
	/** Wildcard modules without a sample in {@link WILDCARD_SAMPLES}, which cannot be checked. */
	skipped: string[];
}

/**
 * Concrete module each wildcard module is checked against. Every module under the wildcard
 * is generated with the same exports (`@motiojs/google-fonts` writes one module per font from
 * one template), so one sample stands for all of them.
 */
export const WILDCARD_SAMPLES: Readonly<Record<string, string>> = {
	"@remotion/google-fonts/*": "@remotion/google-fonts/Roboto",
};

/** Export names of a Motio module, or `null` when the module does not exist. */
export type ExportLoader = (specifier: string) => Promise<ReadonlySet<string> | null>;

/**
 * Recomputes value statuses from what Motio actually exports: a missing symbol that is now
 * exported becomes `supported`; a symbol that is no longer exported becomes `missing`.
 * `approximated` and `stubbed` are set by hand and kept while the export exists. Type exports
 * are not visible at runtime: they are checked only when `loadTypeExports` is given (it reads
 * the built declaration files), and left alone otherwise.
 */
export async function updateManifestStatuses(
	manifest: Manifest,
	loadExports: ExportLoader,
	loadTypeExports?: ExportLoader,
): Promise<StatusUpdate> {
	const next: Manifest = structuredClone(manifest);
	const changes: StatusChange[] = [];
	const unavailable: string[] = [];
	const skipped: string[] = [];
	for (const [specifier, module] of Object.entries(next.modules)) {
		const sample = specifier.endsWith("/*") ? WILDCARD_SAMPLES[specifier] : specifier;
		if (!sample) {
			skipped.push(specifier);
			continue;
		}
		const resolution = mapSpecifier(sample);
		if (resolution.kind !== "mapped") continue;
		const exported = await loadExports(resolution.target);
		if (!exported) unavailable.push(resolution.target);
		const typeExports = loadTypeExports ? await loadTypeExports(resolution.target) : null;
		for (const [name, symbol] of Object.entries(module.symbols)) {
			if (symbol.kind !== "value" && !typeExports) continue;
			const has =
				symbol.kind === "value"
					? (exported?.has(name) ?? false)
					: (typeExports?.has(name) ?? false);
			let to: SymbolStatus = symbol.status;
			if (has && symbol.status === "missing") to = "supported";
			if (!has && symbol.status !== "missing") to = "missing";
			if (to !== symbol.status) {
				changes.push({ specifier, symbol: name, from: symbol.status, to });
				symbol.status = to;
			}
		}
	}
	return { manifest: next, changes, unavailable, skipped };
}

/** Finds workspace packages by name under `<root>/packages`. */
function workspacePackages(root: string): Map<string, string> {
	const packages = new Map<string, string>();
	const base = join(root, "packages");
	for (const entry of readdirSync(base, { withFileTypes: true })) {
		const manifestPath = join(base, entry.name, "package.json");
		if (!entry.isDirectory() || !existsSync(manifestPath)) continue;
		const { name } = JSON.parse(readFileSync(manifestPath, "utf8")) as { name: string };
		packages.set(name, join(base, entry.name));
	}
	return packages;
}

const NOT_FOUND = new Set([
	"ERR_MODULE_NOT_FOUND",
	"MODULE_NOT_FOUND",
	"ERR_PACKAGE_PATH_NOT_EXPORTED",
]);

/**
 * Loads the built output of workspace packages (each package resolves its own name through
 * its `exports`), so `pnpm build` must run first. Missing packages or subpaths yield `null`.
 */
export function workspaceExportLoader(root: string): ExportLoader {
	const packages = workspacePackages(root);
	return async (specifier) => {
		const { packageName } = splitSpecifier(specifier);
		const directory = packages.get(packageName);
		if (!directory) return null;
		let resolved: string;
		try {
			resolved = createRequire(join(directory, "package.json")).resolve(specifier);
		} catch (error) {
			if (NOT_FOUND.has((error as { code?: string }).code ?? "")) return null;
			throw error;
		}
		if (!existsSync(resolved)) return null;
		const module = (await import(pathToFileURL(resolved).href)) as Record<string, unknown>;
		return new Set(Object.keys(module));
	};
}

/** Names exported by a declaration file, following `export *` and re-exports of relative files. */
export function declarationExports(path: string, seen = new Set<string>()): Set<string> {
	const names = new Set<string>();
	if (seen.has(path) || !existsSync(path)) return names;
	seen.add(path);
	const { module } = parseSync(path, readFileSync(path, "utf8"));
	for (const statement of module.staticExports) {
		for (const entry of statement.entries) {
			if (entry.exportName.name) {
				names.add(entry.exportName.name);
				continue;
			}
			const request = entry.moduleRequest?.value;
			if (entry.importName.kind === "AllButDefault" && request?.startsWith(".")) {
				const target = join(dirname(path), request).replace(/\.js$/, ".d.ts");
				for (const name of declarationExports(target, seen)) names.add(name);
			}
		}
	}
	return names;
}

/**
 * Loads the type and value names a workspace module declares, from the `.d.ts` file next to its
 * built JavaScript (`pnpm build` must run first). Missing packages or subpaths yield `null`.
 */
export function workspaceTypeExportLoader(root: string): ExportLoader {
	const packages = workspacePackages(root);
	return async (specifier) => {
		const { packageName } = splitSpecifier(specifier);
		const directory = packages.get(packageName);
		if (!directory) return null;
		let resolved: string;
		try {
			resolved = createRequire(join(directory, "package.json")).resolve(specifier);
		} catch (error) {
			if (NOT_FOUND.has((error as { code?: string }).code ?? "")) return null;
			throw error;
		}
		const declarations = resolved.replace(/\.js$/, ".d.ts");
		return existsSync(declarations) ? declarationExports(declarations) : null;
	};
}
