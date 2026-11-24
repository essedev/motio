// Copies the example files into the code blocks of the guide and of the package READMEs. In a
// page, a code block preceded by `<!-- example: path/file.tsx -->` shows that file, and
// `<!-- example: path/file.tsx#name -->` shows the lines between `// region: name` and
// `// endregion` in it, preceded by the import lines of the file that those lines use, so every
// snippet says where its names come from. Paths are relative to the page. The files are
// type-checked by `tsc -b` (make check); sync.test.ts fails when a page and its files differ, and
// when a TypeScript block has no example comment.
//
// Usage: node docs/guide/examples/sync.ts           rewrite the pages
//        node docs/guide/examples/sync.ts --check   exit 1 if a page is out of date
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** The guide directory, holding the pages and `examples/`. */
export const GUIDE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The repository root, holding `packages/`. */
export const REPO_DIR = join(GUIDE_DIR, "..", "..");

const MARKER = /^<!-- example: (\S+?)(?:#([\w-]+))? -->$/;
const FENCE = /^```(\w*)\s*$/;
const LANGUAGES: Record<string, string> = { ".ts": "ts", ".tsx": "tsx" };

/** Languages whose blocks must come from an example file. */
const CHECKED_LANGUAGES = new Set(["ts", "tsx", "typescript", "js", "jsx", "javascript"]);

/** Line width of the generated import lines, as Biome formats the example files. */
const LINE_WIDTH = 100;

/** One `import ... from "..."` declaration of an example file. */
interface ImportDeclaration {
	module: string;
	typeOnly: boolean;
	defaultName: string | undefined;
	namespace: string | undefined;
	/** Named specifiers as written (`a`, `b as c`, `type T`), with the local name of each. */
	named: Array<{ text: string; local: string }>;
}

/** The `import ... from` declarations of a file; side-effect imports (`import "./a"`) are left out. */
export function parseImports(text: string): ImportDeclaration[] {
	const declarations: ImportDeclaration[] = [];
	const pattern = /^import\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["'];?/gm;
	for (const match of text.matchAll(pattern)) {
		const [, typeKeyword, clause = "", module = ""] = match;
		const braces = /\{([^}]*)\}/.exec(clause);
		const outside = (braces ? clause.replace(braces[0], "") : clause)
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean);
		const namespace = outside.find((part) => part.startsWith("*"))?.replace(/^\*\s+as\s+/, "");
		const defaultName = outside.find((part) => !part.startsWith("*"));
		const named = (braces?.[1] ?? "")
			.split(",")
			.map((part) => part.trim().replace(/\s+/g, " "))
			.filter(Boolean)
			.map((text) => ({ text, local: text.split(" ").at(-1) as string }));
		declarations.push({
			module,
			typeOnly: typeKeyword !== undefined,
			defaultName,
			namespace,
			named,
		});
	}
	return declarations;
}

/**
 * The identifiers a piece of TypeScript refers to: every word outside comments, strings and the
 * text of template literals, except property names after a `.`. Words of JSX text count too,
 * which at worst shows an import the snippet does not need.
 */
export function referencedNames(code: string): Set<string> {
	const names = new Set<string>();
	// Open template literals ("`") and the braces inside their `${}` ("${") or around them ("{").
	const stack: string[] = [];
	let previous = "";
	let index = 0;
	while (index < code.length) {
		const char = code[index] as string;
		if (stack.at(-1) === "`") {
			if (char === "\\") index += 2;
			else if (char === "`") {
				stack.pop();
				previous = "`";
				index++;
			} else if (char === "$" && code[index + 1] === "{") {
				stack.push("${");
				index += 2;
			} else index++;
			continue;
		}
		const next = code[index + 1];
		if (char === "/" && next === "/") {
			const end = code.indexOf("\n", index);
			index = end === -1 ? code.length : end;
		} else if (char === "/" && next === "*") {
			const end = code.indexOf("*/", index + 2);
			index = end === -1 ? code.length : end + 2;
		} else if (char === '"' || char === "'") {
			// A string ends at its closing quote or at the end of the line, so an apostrophe in
			// JSX text cannot hide more than the rest of its line.
			index++;
			while (index < code.length && code[index] !== char && code[index] !== "\n") {
				index += code[index] === "\\" ? 2 : 1;
			}
			index++;
			previous = char;
		} else if (char === "`") {
			stack.push("`");
			index++;
		} else if (char === "{") {
			stack.push("{");
			previous = char;
			index++;
		} else if (char === "}") {
			stack.pop();
			previous = char;
			index++;
		} else if (/[A-Za-z_$]/.test(char)) {
			const word = (/^[\w$]+/.exec(code.slice(index)) as RegExpExecArray)[0];
			const spread = code.slice(index - 3, index) === "...";
			if (previous !== "." || spread) names.add(word);
			previous = "a";
			index += word.length;
		} else if (/\d/.test(char)) {
			index += (/^[\w.]+/.exec(code.slice(index)) as RegExpExecArray)[0].length;
			previous = "0";
		} else {
			if (!/\s/.test(char)) previous = char;
			index++;
		}
	}
	return names;
}

/** An import declaration reduced to the names `used`, formatted as Biome would, or undefined. */
function formatImport(declaration: ImportDeclaration, used: Set<string>): string | undefined {
	const defaultName =
		declaration.defaultName && used.has(declaration.defaultName)
			? declaration.defaultName
			: undefined;
	const namespace =
		declaration.namespace && used.has(declaration.namespace)
			? `* as ${declaration.namespace}`
			: undefined;
	let named = declaration.named.filter((s) => used.has(s.local)).map((s) => s.text);
	if (!defaultName && !namespace && named.length === 0) return undefined;
	// Only types left: `import type { A }`, as Biome writes it, rather than `import { type A }`.
	const typesOnly =
		declaration.typeOnly ||
		(!defaultName && !namespace && named.every((text) => text.startsWith("type ")));
	if (typesOnly) named = named.map((text) => text.replace(/^type /, ""));
	const head = `import ${typesOnly ? "type " : ""}`;
	const tail = ` from "${declaration.module}";`;
	const before = [defaultName, namespace].filter(Boolean).join(", ");
	const separator = before && named.length > 0 ? ", " : "";
	const oneLine = `${head}${before}${separator}${named.length > 0 ? `{ ${named.join(", ")} }` : ""}${tail}`;
	if (oneLine.length <= LINE_WIDTH || named.length === 0) return oneLine;
	return `${head}${before}${separator}{\n${named.map((n) => `\t${n},\n`).join("")}}${tail}`;
}

/**
 * Names a snippet declares itself with `const`, `let`, `var`, `function` or `class`, including
 * destructured ones (`const { delayRender } = useDelayRender()`): they shadow imports.
 */
export function declaredNames(code: string): Set<string> {
	const names = new Set<string>();
	for (const [, binding = ""] of code.matchAll(
		/\b(?:const|let|var)\s+(\{[^}]*\}|\[[^\]]*\]|[\w$]+)/g,
	)) {
		const parts = /^[[{]/.test(binding) ? binding.slice(1, -1).split(",") : [binding];
		for (const part of parts) {
			const local = part.split("=")[0]?.split(":").at(-1)?.replace("...", "").trim();
			if (local) names.add(local);
		}
	}
	for (const [, name = ""] of code.matchAll(/\b(?:function|class)\s+([\w$]+)/g)) names.add(name);
	return names;
}

/** The import lines of `fileText` that `snippet` uses, in the order of the file. */
export function importsFor(fileText: string, snippet: string): string[] {
	const used = referencedNames(snippet);
	for (const name of declaredNames(snippet)) used.delete(name);
	return parseImports(fileText).flatMap((declaration) => formatImport(declaration, used) ?? []);
}

/**
 * The text a marker refers to: a whole file, or one region of it, without the region comments.
 * A region is preceded by the imports it uses, unless it holds import lines of its own.
 * `file` is relative to `dir`, the directory of the page.
 */
export function exampleText(file: string, region: string | undefined, dir = GUIDE_DIR): string {
	const text = readFileSync(join(dir, file), "utf8");
	const lines = text.replace(/\n$/, "").split("\n");
	const isRegionComment = (line: string) => /^\s*\/\/ (region: [\w-]+|endregion)\s*$/.test(line);
	if (region === undefined) return lines.filter((line) => !isRegionComment(line)).join("\n");
	const start = lines.findIndex((line) => line.trim() === `// region: ${region}`);
	if (start === -1) throw new Error(`${file} has no region "${region}".`);
	const end = lines.findIndex((line, index) => index > start && line.trim() === "// endregion");
	if (end === -1) throw new Error(`Region "${region}" of ${file} has no "// endregion".`);
	const body = lines.slice(start + 1, end).filter((line) => !isRegionComment(line));
	const indent = Math.min(
		...body.filter((line) => line.trim() !== "").map((line) => /^\t*/.exec(line)?.[0].length ?? 0),
	);
	const snippet = body
		.map((line) => line.slice(indent))
		.join("\n")
		.replace(/^\n+|\n+$/g, "");
	if (/^import\s/m.test(snippet)) return snippet;
	const imports = importsFor(text, snippet);
	return imports.length > 0 ? `${imports.join("\n")}\n\n${snippet}` : snippet;
}

/**
 * A page with every example block replaced by its file, and the problems found. `dir` is the
 * directory of the page, against which example paths resolve.
 */
export function syncPage(page: string, dir = GUIDE_DIR): { text: string; problems: string[] } {
	const lines = page.split("\n");
	const out: string[] = [];
	const problems: string[] = [];
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] as string;
		const marker = MARKER.exec(line);
		const fence = FENCE.exec(line);
		if (marker) {
			const [, file = "", region] = marker;
			out.push(line);
			const open = lines[index + 1] ?? "";
			const close = lines.findIndex((l, i) => i > index + 1 && l.startsWith("```"));
			if (!FENCE.test(open) || close === -1) {
				problems.push(
					`line ${index + 1}: the example comment for ${file} is not followed by a code block`,
				);
				continue;
			}
			const extension = file.slice(file.lastIndexOf("."));
			out.push(`\`\`\`${LANGUAGES[extension] ?? ""}`, exampleText(file, region, dir), "```");
			index = close;
		} else if (fence) {
			const language = fence[1] ?? "";
			if (CHECKED_LANGUAGES.has(language)) {
				problems.push(
					`line ${index + 1}: a ${language} block without an example comment is not type-checked`,
				);
			}
			const close = lines.findIndex((l, i) => i > index && l.startsWith("```"));
			const end = close === -1 ? lines.length - 1 : close;
			out.push(...lines.slice(index, end + 1));
			index = end;
		} else {
			out.push(line);
		}
	}
	return { text: out.join("\n"), problems };
}

/** Directories that hold no pages: the examples package and installed dependencies. */
const SKIPPED = new Set(["examples", "node_modules", "dist"]);

/** The Markdown pages of the guide, relative to it. */
export function guidePages(dir = ""): string[] {
	const pages: string[] = [];
	for (const entry of readdirSync(join(GUIDE_DIR, dir), { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory() && !SKIPPED.has(entry.name)) pages.push(...guidePages(path));
		else if (entry.isFile() && entry.name.endsWith(".md")) pages.push(path);
	}
	return pages.sort();
}

/** The README of every package, relative to the repository root. */
export function packageReadmes(): string[] {
	const packages = join(REPO_DIR, "packages");
	return readdirSync(packages)
		.map((name) => join("packages", name, "README.md"))
		.filter((path) => existsSync(join(REPO_DIR, path)))
		.sort();
}

/** Every page whose code blocks are checked, as absolute paths. */
export function checkedPages(): string[] {
	return [
		...guidePages().map((page) => join(GUIDE_DIR, page)),
		...packageReadmes().map((page) => join(REPO_DIR, page)),
	];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const check = process.argv.includes("--check");
	let failed = false;
	for (const path of checkedPages()) {
		const page = relative(REPO_DIR, path);
		const before = readFileSync(path, "utf8");
		const { text, problems } = syncPage(before, dirname(path));
		for (const problem of problems) console.error(`${page}: ${problem}`);
		if (problems.length > 0) failed = true;
		if (text !== before) {
			if (check) {
				console.error(`${page} is out of date: run node docs/guide/examples/sync.ts`);
				failed = true;
			} else {
				writeFileSync(path, text);
				console.log(`Updated ${page}`);
			}
		}
	}
	process.exitCode = failed ? 1 : 0;
}
