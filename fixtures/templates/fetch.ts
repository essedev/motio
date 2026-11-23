// Fetches the official Remotion templates listed in templates.json at their pinned commits
// into .cache/<name> (gitignored). The templates are never vendored: tests and the oracle call
// this before using them. A checkout already at the pinned commit is reused.
// Run: node fixtures/templates/fetch.ts [name...]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export const TEMPLATES_DIR = import.meta.dirname;
export const CACHE_DIR = join(TEMPLATES_DIR, ".cache");

export interface TemplateEntry {
	repository: string;
	commit: string;
	/** Composition id to frames compared with Remotion's reference stills. */
	stills?: Record<string, number[]>;
	/** The template loads fonts from the internet while rendering. */
	network?: boolean;
	/** Motio symbols the template needs that are not implemented yet. */
	blockedBy?: string[];
	/** `<composition>/<frame>` to the reason that still does not match Remotion's yet. */
	knownMismatch?: Record<string, string>;
	/** Remotion packages the template imports that Motio does not provide. */
	unsupported?: string[];
}

export function readTemplates(): Record<string, TemplateEntry> {
	const file = JSON.parse(readFileSync(join(TEMPLATES_DIR, "templates.json"), "utf8")) as {
		templates: Record<string, TemplateEntry>;
	};
	return file.templates;
}

function git(cwd: string, args: string[]): string {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function headOf(directory: string): string | null {
	if (!existsSync(join(directory, ".git"))) return null;
	try {
		return git(directory, ["rev-parse", "HEAD"]);
	} catch {
		return null;
	}
}

/** Checks out one template at its pinned commit and returns its directory. */
export function fetchTemplate(name: string): string {
	const entry = readTemplates()[name];
	if (!entry) throw new Error(`fixtures/templates/templates.json has no template "${name}"`);
	const directory = join(CACHE_DIR, name);
	if (headOf(directory) === entry.commit && git(directory, ["status", "--porcelain"]) === "") {
		return directory;
	}
	rmSync(directory, { recursive: true, force: true });
	mkdirSync(directory, { recursive: true });
	git(directory, ["init", "--quiet"]);
	git(directory, ["fetch", "--quiet", "--depth", "1", entry.repository, entry.commit]);
	git(directory, ["-c", "advice.detachedHead=false", "checkout", "--quiet", "FETCH_HEAD"]);
	const head = headOf(directory);
	if (head !== entry.commit) {
		throw new Error(`${name}: checked out ${head ?? "nothing"}, expected ${entry.commit}`);
	}
	return directory;
}

/** Fetches the named templates, or all of them. */
export function fetchTemplates(
	names: readonly string[] = Object.keys(readTemplates()),
): Record<string, string> {
	return Object.fromEntries(names.map((name) => [name, fetchTemplate(name)]));
}

if (process.argv[1] === import.meta.filename) {
	for (const [name, directory] of Object.entries(
		fetchTemplates(process.argv.length > 2 ? process.argv.slice(2) : undefined),
	)) {
		console.log(`${name}: ${directory}`);
	}
}
