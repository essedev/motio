import { loadManifest, lookupSymbol, type Manifest, type SymbolStatus } from "./manifest.js";
import { describeUnavailable, mapSpecifier, splitSpecifier, type Tier } from "./mapping.js";
import { type FileUsage, type ScanOptions, scanProject } from "./scan.js";

/** Status of one used symbol, extending the manifest statuses with resolution failures. */
export type ReportStatus =
	| SymbolStatus
	/** The package maps to Motio but the symbol is not in the manifest. */
	| "unknown-symbol"
	/** The package has no Motio equivalent (or it is planned for later). */
	| "unsupported-package"
	/** The package is not in the mapping table at all. */
	| "unknown-package"
	/** A namespace import used as a value: symbols cannot be listed statically. */
	| "opaque";

export interface SymbolLocation {
	file: string;
	line: number;
}

export interface ReportEntry {
	specifier: string;
	symbol: string;
	isType: boolean;
	status: ReportStatus;
	tier: Tier | null;
	/** Motio module the specifier resolves to, when mapped. */
	target: string | null;
	note: string | null;
	/** Members read from the symbol (e.g. `Config` setters), merged over all files. */
	members: string[];
	locations: SymbolLocation[];
}

export interface CompatibilityReport {
	/** Compatibility target of the manifest, e.g. `remotion@4.0.545`. */
	target: string;
	filesScanned: number;
	entries: ReportEntry[];
	summary: Record<ReportStatus, number>;
	parseErrors: Array<{ file: string; errors: string[] }>;
	/** True when nothing used is missing, unsupported or unknown. */
	ok: boolean;
}

const BLOCKING: ReadonlySet<ReportStatus> = new Set([
	"missing",
	"unknown-symbol",
	"unsupported-package",
	"unknown-package",
]);

function classify(
	manifest: Manifest,
	specifier: string,
	symbol: string,
): Pick<ReportEntry, "status" | "tier" | "target" | "note"> {
	const resolution = mapSpecifier(specifier);
	if (resolution.kind === "unknown") {
		return {
			status: "unknown-package",
			tier: null,
			target: null,
			note: describeUnavailable(specifier, undefined),
		};
	}
	if (resolution.kind === "unsupported") {
		return {
			status: "unsupported-package",
			tier: resolution.mapping.tier,
			target: null,
			note: describeUnavailable(specifier, resolution.mapping),
		};
	}
	if (symbol === "*") {
		return {
			status: "opaque",
			tier: resolution.mapping.tier,
			target: resolution.target,
			note: "The module namespace is used as a value; check its uses by hand.",
		};
	}
	const entry = lookupSymbol(manifest, specifier, symbol);
	if (!entry) {
		return {
			status: "unknown-symbol",
			tier: resolution.mapping.tier,
			target: resolution.target,
			note: `"${symbol}" is not a public export of ${splitSpecifier(specifier).packageName} in ${manifest.target}.`,
		};
	}
	return {
		status: entry.status,
		tier: entry.tier,
		target: resolution.target,
		note: entry.note ?? null,
	};
}

/** Builds the report from scan results; pure, so it can be tested without a file system. */
export function buildReport(
	files: readonly FileUsage[],
	filesScanned: number,
	manifest: Manifest = loadManifest(),
): CompatibilityReport {
	const byKey = new Map<string, ReportEntry>();
	for (const file of files) {
		for (const usage of file.imports) {
			const symbols =
				usage.symbols.length > 0 ? usage.symbols : [{ name: "*", isType: false, line: usage.line }];
			for (const symbol of symbols) {
				// A side-effect import (`import "remotion"`) only needs the package to resolve.
				const name = usage.symbols.length === 0 ? "(side effect)" : symbol.name;
				const key = `${usage.specifier}\0${name}\0${symbol.isType}`;
				let entry = byKey.get(key);
				if (!entry) {
					const classified =
						name === "(side effect)"
							? sideEffectStatus(manifest, usage.specifier)
							: classify(manifest, usage.specifier, name);
					entry = {
						specifier: usage.specifier,
						symbol: name,
						isType: symbol.isType,
						...classified,
						members: [],
						locations: [],
					};
					byKey.set(key, entry);
				}
				entry.locations.push({ file: file.file, line: symbol.line });
				for (const member of "members" in symbol ? (symbol.members ?? []) : []) {
					if (!entry.members.includes(member)) entry.members.push(member);
				}
			}
		}
	}
	const entries = [...byKey.values()].sort(
		(a, b) => a.specifier.localeCompare(b.specifier) || a.symbol.localeCompare(b.symbol),
	);
	const summary: Record<ReportStatus, number> = {
		supported: 0,
		approximated: 0,
		stubbed: 0,
		missing: 0,
		"unknown-symbol": 0,
		"unsupported-package": 0,
		"unknown-package": 0,
		opaque: 0,
	};
	for (const entry of entries) summary[entry.status]++;
	return {
		target: manifest.target,
		filesScanned,
		entries,
		summary,
		parseErrors: files
			.filter((f) => f.errors.length > 0)
			.map((f) => ({ file: f.file, errors: f.errors })),
		ok: entries.every((e) => !BLOCKING.has(e.status)),
	};
}

function sideEffectStatus(
	manifest: Manifest,
	specifier: string,
): Pick<ReportEntry, "status" | "tier" | "target" | "note"> {
	const classified = classify(manifest, specifier, "*");
	if (classified.status === "opaque") {
		return { ...classified, status: "supported", note: "Side-effect import." };
	}
	return classified;
}

/**
 * Scans a project for imports of `remotion` and `@remotion/*` and reports each symbol used
 * with its manifest status. Used by `motio doctor`.
 */
export async function createCompatibilityReport(
	root: string,
	options: ScanOptions & { manifest?: Manifest } = {},
): Promise<CompatibilityReport> {
	const scan = await scanProject(root, options);
	return buildReport(scan.usages, scan.filesScanned, options.manifest ?? loadManifest());
}
