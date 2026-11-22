import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { loadManifest, lookupSymbol, type Manifest } from "./manifest.js";
import { describeUnavailable, isRemotionSpecifier, mapSpecifier } from "./mapping.js";
import { scanSource } from "./scan.js";

/** Options of {@link motioCompat}. */
export interface MotioCompatOptions {
	/**
	 * What to do when code imports a symbol whose manifest status is `missing` (or warn on
	 * `stubbed`). `warn` (default) prints the symbol, its tier and milestone; the build still
	 * fails if the Motio package does not export it. `error` fails on the first such file.
	 */
	symbols?: "error" | "warn" | "off";
	/** Extra mappings, checked before the built-in table: Remotion specifier to module id. */
	aliases?: Record<string, string>;
	/** Manifest to check symbols against; defaults to the one shipped with this package. */
	manifest?: Manifest;
}

const SCANNABLE = /\.(?:[cm]?[jt]sx?)$/;

function cleanId(id: string): string {
	const query = id.indexOf("?");
	return query === -1 ? id : id.slice(0, query);
}

/** Symbols the importer takes from `specifier`, read from its source; empty if unknown. */
function importedSymbols(importer: string | undefined, specifier: string): string[] {
	if (!importer || importer.startsWith("\0")) return [];
	const path = cleanId(importer);
	if (!SCANNABLE.test(path)) return [];
	let source: string;
	try {
		source = readFileSync(path, "utf8");
	} catch {
		// Virtual or generated importer: the error message simply omits the symbol names.
		return [];
	}
	const { imports } = scanSource(path, source, { filter: (s) => s === specifier });
	return [...new Set(imports.flatMap((usage) => usage.symbols.map((symbol) => symbol.name)))];
}

/**
 * Vite plugin resolving `remotion` to `motio` and `@remotion/<pkg>` (with subpaths) to the
 * Motio package that replaces it, including `@remotion/cli/config` to
 * `@motiojs/compat/config`. Importing a package Motio does not provide fails the build with
 * the package, the imported symbols and the alternative or roadmap tier.
 */
export function motioCompat(options: MotioCompatOptions = {}): Plugin {
	const mode = options.symbols ?? "warn";
	const aliases = options.aliases ?? {};
	let manifest: Manifest | undefined = options.manifest;

	return {
		name: "motio:compat",
		enforce: "pre",

		async resolveId(source, importer, resolveOptions) {
			if (!isRemotionSpecifier(source) && !(source in aliases)) return null;
			const alias = aliases[source];
			const resolution = alias ? ({ kind: "alias", target: alias } as const) : mapSpecifier(source);
			if (resolution.kind === "unknown" || resolution.kind === "unsupported") {
				const mapping = resolution.kind === "unsupported" ? resolution.mapping : undefined;
				this.error(
					`[motio:compat] ${describeUnavailable(source, mapping, importedSymbols(importer, source))}` +
						(importer ? ` (imported by ${cleanId(importer)})` : ""),
				);
			}
			const resolved = await this.resolve(resolution.target, importer, {
				...resolveOptions,
				skipSelf: true,
			});
			if (resolved) return resolved;
			const mapping = resolution.kind === "mapped" ? resolution.mapping : undefined;
			this.error(
				`[motio:compat] "${source}" maps to "${resolution.target}", which cannot be resolved. ` +
					describeUnavailable(source, mapping, importedSymbols(importer, source)) +
					` Install "${resolution.target
						.split("/")
						.slice(0, resolution.target.startsWith("@") ? 2 : 1)
						.join("/")}" if it is available.`,
			);
		},

		transform(code, id) {
			if (mode === "off" || id.startsWith("\0")) return null;
			const path = cleanId(id);
			if (!SCANNABLE.test(path) || !code.includes("remotion")) return null;
			manifest ??= loadManifest();
			const problems: string[] = [];
			for (const usage of scanSource(path, code).imports) {
				const resolution = mapSpecifier(usage.specifier);
				if (resolution.kind !== "mapped") continue;
				for (const symbol of usage.symbols) {
					if (symbol.isType || symbol.name === "*") continue;
					const entry = lookupSymbol(manifest, usage.specifier, symbol.name);
					if (!entry) continue;
					const where = `${path}:${symbol.line}`;
					if (entry.status === "missing") {
						problems.push(
							`"${symbol.name}" from "${usage.specifier}" is not implemented in Motio yet (Tier ${entry.tier}, ${resolution.mapping.milestone}) at ${where}`,
						);
					} else if (entry.status === "stubbed") {
						this.warn(
							`[motio:compat] "${symbol.name}" from "${usage.specifier}" is a stub in Motio${entry.note ? `: ${entry.note}` : ""} (${where})`,
						);
					}
				}
			}
			if (problems.length === 0) return null;
			const message = `[motio:compat] ${problems.join("; ")}.`;
			if (mode === "error") this.error(message);
			this.warn(message);
			return null;
		},
	};
}
