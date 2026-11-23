// Copies the example files into the guide's code blocks. In a page, a code block preceded by
// `<!-- example: examples/src/file.tsx -->` shows that file, and
// `<!-- example: examples/src/file.tsx#name -->` shows the lines between `// region: name` and
// `// endregion` in it. The files are type-checked by `tsc -b` (make check); sync.test.ts fails
// when a page and its files differ, and when a TypeScript block has no example comment.
//
// Usage: node docs/guide/examples/sync.ts           rewrite the pages
//        node docs/guide/examples/sync.ts --check   exit 1 if a page is out of date
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The guide directory, holding the pages and `examples/`. */
export const GUIDE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const MARKER = /^<!-- example: (\S+?)(?:#([\w-]+))? -->$/;
const FENCE = /^```(\w*)\s*$/;
const LANGUAGES: Record<string, string> = { ".ts": "ts", ".tsx": "tsx" };

/** Languages whose blocks must come from an example file. */
const CHECKED_LANGUAGES = new Set(["ts", "tsx", "typescript", "js", "jsx", "javascript"]);

/** The text a marker refers to: a whole file, or one region of it, without the region comments. */
export function exampleText(file: string, region: string | undefined): string {
	const text = readFileSync(join(GUIDE_DIR, file), "utf8");
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
	return body
		.map((line) => line.slice(indent))
		.join("\n")
		.replace(/^\n+|\n+$/g, "");
}

/** A page with every example block replaced by its file, and the problems found. */
export function syncPage(page: string): { text: string; problems: string[] } {
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
			out.push(`\`\`\`${LANGUAGES[extension] ?? ""}`, exampleText(file, region), "```");
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const check = process.argv.includes("--check");
	let failed = false;
	for (const page of guidePages()) {
		const path = join(GUIDE_DIR, page);
		const before = readFileSync(path, "utf8");
		const { text, problems } = syncPage(before);
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
