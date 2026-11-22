import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { type BindingPattern, type Expression, parseSync, Visitor } from "oxc-parser";
import { isRemotionSpecifier } from "./mapping.js";

/** One symbol taken from a module. `*` means the whole namespace is used opaquely. */
export interface UsedSymbol {
	name: string;
	/** `import type` or `import { type X }`: erased at build time. */
	isType: boolean;
	/** 1-based line of the import or of the member access. */
	line: number;
	/** Properties read from a named import, e.g. `setCodec` for `Config.setCodec(...)`. */
	members?: string[];
}

/** How the module is pulled in. */
export type ImportKind = "static" | "reexport" | "dynamic" | "require";

/** Every use of one module specifier inside one file. */
export interface ModuleUsage {
	specifier: string;
	kind: ImportKind;
	line: number;
	symbols: UsedSymbol[];
}

export interface FileUsage {
	/** Path relative to the scanned root, with forward slashes. */
	file: string;
	imports: ModuleUsage[];
	/** Parse errors; the file is still scanned as far as the parser recovered. */
	errors: string[];
}

export interface ScanOptions {
	/** Which specifiers to collect. Defaults to `remotion`, `remotion/*` and `@remotion/*`. */
	filter?: (specifier: string) => boolean;
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORED_DIRECTORIES = new Set(["node_modules", "dist", "build", "out", "coverage"]);

function lineIndex(source: string): (offset: number) => number {
	const starts = [0];
	for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) starts.push(i + 1);
	return (offset) => {
		let low = 0;
		let high = starts.length - 1;
		while (low < high) {
			const mid = (low + high + 1) >> 1;
			if ((starts[mid] as number) <= offset) low = mid;
			else high = mid - 1;
		}
		return low + 1;
	};
}

function stringValue(node: Expression | null | undefined): string | undefined {
	if (!node) return undefined;
	if (node.type === "Literal" && typeof node.value === "string") return node.value;
	if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
		return node.quasis[0]?.value.cooked ?? undefined;
	}
	return undefined;
}

/** Names bound by `const { a, b: c } = ...`; `undefined` when the pattern is not a plain object. */
function destructuredNames(id: BindingPattern): string[] | undefined {
	if (id.type !== "ObjectPattern") return undefined;
	const names: string[] = [];
	for (const property of id.properties) {
		if (property.type !== "Property" || property.computed) return undefined;
		const key = property.key;
		if (key.type === "Identifier") names.push(key.name);
		else if (key.type === "Literal" && typeof key.value === "string") names.push(key.value);
		else return undefined;
	}
	return names;
}

/**
 * Collects imports of Remotion modules (or any modules matching `filter`) from one source
 * file, with the symbols used: named and default imports, re-exports, members read from a
 * namespace import (`R.interpolate`, `<R.Sequence>`), destructured dynamic imports and
 * `require` calls.
 */
export function scanSource(
	filename: string,
	source: string,
	options: ScanOptions = {},
): { imports: ModuleUsage[]; errors: string[] } {
	const filter = options.filter ?? isRemotionSpecifier;
	const result = parseSync(filename, source);
	const toLine = lineIndex(source);
	const imports: ModuleUsage[] = [];
	const namespaces = new Map<string, ModuleUsage>();
	// Identifier offsets that are not opaque namespace reads: the import bindings themselves,
	// the objects of member expressions already recorded, non-computed property names.
	const bindingStarts = new Set<number>();
	const namedBindings = new Map<string, UsedSymbol>();

	for (const statement of result.module.staticImports) {
		const specifier = statement.moduleRequest.value;
		if (!filter(specifier)) continue;
		const usage: ModuleUsage = {
			specifier,
			kind: "static",
			line: toLine(statement.start),
			symbols: [],
		};
		for (const entry of statement.entries) {
			const kind = String(entry.importName.kind);
			const line = toLine(entry.localName.start);
			if (kind === "Name" && entry.importName.name) {
				const symbol: UsedSymbol = { name: entry.importName.name, isType: entry.isType, line };
				usage.symbols.push(symbol);
				if (!entry.isType) namedBindings.set(entry.localName.value, symbol);
			} else if (kind === "Default") {
				usage.symbols.push({ name: "default", isType: entry.isType, line });
			} else if (kind === "NamespaceObject") {
				if (entry.isType) usage.symbols.push({ name: "*", isType: true, line });
				else {
					namespaces.set(entry.localName.value, usage);
					bindingStarts.add(entry.localName.start);
				}
			}
		}
		imports.push(usage);
	}

	for (const statement of result.module.staticExports) {
		for (const entry of statement.entries) {
			const specifier = entry.moduleRequest?.value;
			if (!specifier || !filter(specifier)) continue;
			const kind = String(entry.importName.kind);
			const name = kind === "Name" ? (entry.importName.name ?? "*") : "*";
			imports.push({
				specifier,
				kind: "reexport",
				line: toLine(entry.start),
				symbols: [{ name, isType: entry.isType, line: toLine(entry.start) }],
			});
		}
	}

	const handledCalls = new Set<number>();
	const opaqueNamespaceUses = new Set<string>();
	const memberReads = new Map<string, Set<string>>();

	const recordDynamic = (
		specifier: string,
		kind: ImportKind,
		start: number,
		names: string[] | undefined,
	) => {
		const line = toLine(start);
		imports.push({
			specifier,
			kind,
			line,
			symbols: (names ?? ["*"]).map((name) => ({ name, isType: false, line })),
		});
	};

	const requireSpecifier = (node: Expression | null): string | undefined => {
		if (node?.type !== "CallExpression") return undefined;
		if (node.callee.type !== "Identifier" || node.callee.name !== "require") return undefined;
		const first = node.arguments[0];
		return first && first.type !== "SpreadElement" ? stringValue(first) : undefined;
	};

	const visitor = new Visitor({
		VariableDeclarator(node) {
			let init = node.init;
			if (init?.type === "AwaitExpression") init = init.argument;
			if (init?.type === "ImportExpression") {
				const specifier = stringValue(init.source);
				if (specifier && filter(specifier)) {
					handledCalls.add(init.start);
					recordDynamic(specifier, "dynamic", init.start, destructuredNames(node.id));
				}
				return;
			}
			const specifier = requireSpecifier(init);
			if (specifier && init && filter(specifier)) {
				handledCalls.add(init.start);
				recordDynamic(specifier, "require", init.start, destructuredNames(node.id));
			}
		},
		ImportExpression(node) {
			if (handledCalls.has(node.start)) return;
			const specifier = stringValue(node.source);
			if (specifier && filter(specifier))
				recordDynamic(specifier, "dynamic", node.start, undefined);
		},
		CallExpression(node) {
			if (handledCalls.has(node.start)) return;
			const specifier = requireSpecifier(node);
			if (specifier && filter(specifier))
				recordDynamic(specifier, "require", node.start, undefined);
		},
		MemberExpression(node) {
			if (!node.computed) bindingStarts.add(node.property.start);
			if (
				node.object.type === "Identifier" &&
				!node.computed &&
				node.property.type === "Identifier"
			) {
				const symbol = namedBindings.get(node.object.name);
				if (symbol) {
					symbol.members ??= [];
					if (!symbol.members.includes(node.property.name)) symbol.members.push(node.property.name);
				}
			}
			if (node.object.type !== "Identifier" || !namespaces.has(node.object.name)) return;
			let name: string | undefined;
			if (!node.computed && node.property.type === "Identifier") name = node.property.name;
			else if (node.computed) name = stringValue(node.property as Expression);
			const reads = memberReads.get(node.object.name) ?? new Set<string>();
			reads.add(name ?? "*");
			memberReads.set(node.object.name, reads);
			bindingStarts.add(node.object.start);
		},
		JSXMemberExpression(node) {
			if (node.object.type !== "JSXIdentifier" || !namespaces.has(node.object.name)) return;
			const reads = memberReads.get(node.object.name) ?? new Set<string>();
			reads.add(node.property.name);
			memberReads.set(node.object.name, reads);
		},
		Identifier(node) {
			// A namespace identifier read outside a member expression is an opaque use.
			if (namespaces.has(node.name) && !bindingStarts.has(node.start)) {
				opaqueNamespaceUses.add(node.name);
			}
		},
	});
	visitor.visit(result.program);

	for (const [local, usage] of namespaces) {
		const names = new Set(memberReads.get(local));
		if (opaqueNamespaceUses.has(local)) names.add("*");
		for (const name of names) usage.symbols.push({ name, isType: false, line: usage.line });
	}

	return { imports, errors: result.errors.map((error) => error.message) };
}

/** Walks `root` for source files, skipping `node_modules`, build output and dot directories. */
export async function listSourceFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	const walk = async (directory: string): Promise<void> => {
		const entries = await readdir(directory, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				if (!IGNORED_DIRECTORIES.has(entry.name)) await walk(path);
			} else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
				if (!entry.name.endsWith(".d.ts")) files.push(path);
			}
		}
	};
	await walk(root);
	return files.sort();
}

/** Result of scanning a directory tree. */
export interface ProjectScan {
	/** Files with at least one matching import or a parse error. */
	usages: FileUsage[];
	/** Number of source files read. */
	filesScanned: number;
}

/** Scans every source file under `root`; files without matching imports are omitted. */
export async function scanProject(root: string, options: ScanOptions = {}): Promise<ProjectScan> {
	const usages: FileUsage[] = [];
	const paths = await listSourceFiles(root);
	for (const path of paths) {
		const source = await readFile(path, "utf8");
		const { imports, errors } = scanSource(path, source, options);
		if (imports.length === 0 && errors.length === 0) continue;
		usages.push({ file: relative(root, path).split("\\").join("/"), imports, errors });
	}
	return { usages, filesScanned: paths.length };
}
