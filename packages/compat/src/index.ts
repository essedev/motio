export { isCodedError, MotioError } from "./errors.js";
export {
	findModule,
	loadManifest,
	lookupSymbol,
	MANIFEST_URL,
	type Manifest,
	type ManifestModule,
	type ManifestSymbol,
	parseManifest,
	SYMBOL_STATUSES,
	type SymbolStatus,
} from "./manifest.js";
export {
	describeUnavailable,
	isRemotionSpecifier,
	mapSpecifier,
	PACKAGE_MAPPINGS,
	type PackageMapping,
	type Resolution,
	splitSpecifier,
	type Tier,
} from "./mapping.js";
export { type MotioCompatOptions, motioCompat } from "./plugin.js";
export {
	buildReport,
	type CompatibilityReport,
	createCompatibilityReport,
	type ReportEntry,
	type ReportStatus,
	type SymbolLocation,
} from "./report.js";
export {
	type FileUsage,
	type ImportKind,
	listSourceFiles,
	type ModuleUsage,
	type ProjectScan,
	type ScanOptions,
	scanProject,
	scanSource,
	type UsedSymbol,
} from "./scan.js";
export { closest, editDistance } from "./suggest.js";
export { readTailwindMarker, TAILWIND_MARKER, type TailwindVersion } from "./tailwind.js";
