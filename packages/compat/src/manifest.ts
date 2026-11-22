import { readFileSync } from "node:fs";
import type { Tier } from "./mapping.js";

/** How far Motio implements a symbol of the compatibility target. */
export type SymbolStatus = "supported" | "approximated" | "stubbed" | "missing";

export const SYMBOL_STATUSES: readonly SymbolStatus[] = [
	"supported",
	"approximated",
	"stubbed",
	"missing",
];

export interface ManifestSymbol {
	/** `value` exports exist at runtime; `type` exports only exist for TypeScript. */
	kind: "value" | "type";
	tier: Tier;
	status: SymbolStatus;
	note?: string;
}

export interface ManifestModule {
	tier: Tier;
	symbols: Record<string, ManifestSymbol>;
}

/** `packages/compat/manifest.json`: every public export of the compatibility target. */
export interface Manifest {
	$schema?: string;
	/** `remotion@<version>`, see docs/DECISIONS.md D-008. */
	target: string;
	sources: string[];
	excluded: string;
	/** Keyed by module specifier; a trailing `/*` matches any subpath (`@remotion/google-fonts/*`). */
	modules: Record<string, ManifestModule>;
}

/** Location of the manifest shipped with this package. */
export const MANIFEST_URL = new URL("../manifest.json", import.meta.url);

let cached: Manifest | undefined;

/** Reads and caches the manifest shipped with `@motiojs/compat`. */
export function loadManifest(): Manifest {
	cached ??= parseManifest(readFileSync(MANIFEST_URL, "utf8"));
	return cached;
}

/** Parses manifest JSON and checks its shape, so a bad edit fails loudly. */
export function parseManifest(json: string): Manifest {
	const data = JSON.parse(json) as Manifest;
	if (typeof data.target !== "string" || typeof data.modules !== "object" || !data.modules) {
		throw new Error("Invalid compat manifest: expected `target` and `modules`.");
	}
	for (const [specifier, module] of Object.entries(data.modules)) {
		for (const [name, symbol] of Object.entries(module.symbols)) {
			if (!SYMBOL_STATUSES.includes(symbol.status)) {
				throw new Error(
					`Invalid compat manifest: ${specifier}#${name} has status "${symbol.status}".`,
				);
			}
		}
	}
	return data;
}

/** Finds the manifest module for a specifier, honouring `/*` wildcard keys. */
export function findModule(
	manifest: Manifest,
	specifier: string,
): { key: string; module: ManifestModule } | undefined {
	const exact = manifest.modules[specifier];
	if (exact) return { key: specifier, module: exact };
	for (const [key, module] of Object.entries(manifest.modules)) {
		if (key.endsWith("/*") && specifier.startsWith(key.slice(0, -1))) return { key, module };
	}
	return undefined;
}

/** Looks up one symbol; `undefined` when the module or the symbol is not in the manifest. */
export function lookupSymbol(
	manifest: Manifest,
	specifier: string,
	symbol: string,
): ManifestSymbol | undefined {
	return findModule(manifest, specifier)?.module.symbols[symbol];
}
