/**
 * Content loader for the docs collection. Nothing is copied into the site: every page is read
 * from the repository at build time.
 *
 * - Guide: `docs/guide/*.md`. The title comes from the H1 (removed from the body, Starlight
 *   renders it), `<!-- example: ... -->` markers are dropped, links are rewritten by
 *   `remark-repo-links`.
 * - CLI reference: one page per command of `@motiojs/cli`, from its command table (the same data
 *   `motio <command> --help` prints) and its JSON schemas.
 * - Packages: one page per published package that has a README.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import type { Loader, LoaderContext } from "astro/loaders";
import { CLI_PAGE_PREFIX, cliPages } from "./cli-reference.ts";
import { guideSlug, packagePages } from "./pages.ts";
import { REPO_ROOT, repoBlobUrl } from "./repo.ts";

const GUIDE_DIR = join(REPO_ROOT, "docs", "guide");

/** Splits a Markdown file into its H1 title and the rest. */
export const splitTitle = (source: string, file: string) => {
	const match = /^#\s+(.+?)\s*\n/m.exec(source);
	if (!match || match.index === undefined) throw new Error(`${file} has no H1 title`);
	const before = source.slice(0, match.index).trim();
	if (before) throw new Error(`${file} has content before its H1 title`);
	return { title: match[1] ?? "", body: source.slice(match.index + match[0].length) };
};

/** First paragraph of a body, as plain text, for the page description. */
const firstParagraph = (body: string) => {
	const para = body
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.find((p) => p && !/^[#>|`<-]|^\d+\./.test(p));
	if (!para) return undefined;
	const text = para
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/[`*_]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	return text.length > 200 ? `${text.slice(0, 197).replace(/\s+\S*$/, "")}...` : text;
};

const stripExampleMarkers = (body: string) => body.replace(/^<!-- example: [^\n]*-->\n/gm, "");

type Entry = {
	id: string;
	file?: string;
	title: string;
	body: string;
	description?: string | undefined;
	editUrl: string | false;
	sidebarOrder?: number;
	extra?: Record<string, unknown>;
};

const guideEntries = (): Entry[] =>
	readdirSync(GUIDE_DIR)
		.filter((f) => f.endsWith(".md"))
		.map((name) => {
			const file = join(GUIDE_DIR, name);
			const { title, body } = splitTitle(readFileSync(file, "utf8"), file);
			const clean = stripExampleMarkers(body);
			return {
				id: guideSlug(name),
				file,
				title,
				body: clean,
				description: firstParagraph(clean),
				editUrl: repoBlobUrl(relative(REPO_ROOT, file), "edit"),
			};
		});

const packageEntries = (): Entry[] =>
	packagePages().map((pkg) => {
		const { title, body } = splitTitle(readFileSync(pkg.readme, "utf8"), pkg.readme);
		return {
			id: pkg.slug,
			file: pkg.readme,
			title,
			body,
			description: pkg.description,
			editUrl: repoBlobUrl(relative(REPO_ROOT, pkg.readme), "edit"),
		};
	});

const cliEntries = (): Entry[] =>
	cliPages().map((page) => ({
		id: page.slug,
		title: page.title,
		body: page.markdown,
		description: page.description,
		editUrl: false,
		...(page.slug === CLI_PAGE_PREFIX ? { sidebarOrder: 0 } : {}),
	}));

const load = async ({
	store,
	renderMarkdown,
	generateDigest,
	parseData,
	watcher,
}: LoaderContext) => {
	const entries = [...guideEntries(), ...cliEntries(), ...packageEntries()];
	store.clear();
	for (const entry of entries) {
		const data = await parseData({
			id: entry.id,
			data: {
				title: entry.title,
				...(entry.description ? { description: entry.description } : {}),
				editUrl: entry.editUrl,
				...(entry.sidebarOrder !== undefined ? { sidebar: { order: entry.sidebarOrder } } : {}),
				...entry.extra,
			},
		});
		// The file URL lets remark-repo-links resolve relative links from the source file.
		const rendered = await renderMarkdown(
			entry.body,
			entry.file ? { fileURL: pathToFileURL(entry.file) } : undefined,
		);
		store.set({
			id: entry.id,
			data,
			body: entry.body,
			rendered,
			digest: generateDigest(entry.body + JSON.stringify(data)),
			...(entry.file ? { filePath: relative(process.cwd(), entry.file) } : {}),
		});
	}
	if (watcher) {
		for (const dir of [GUIDE_DIR, join(REPO_ROOT, "packages")]) watcher.add(dir);
	}
};

/** The loader of the `docs` collection. */
export const motioDocsLoader = (): Loader => ({
	name: "motio-docs",
	load: async (context) => {
		await load(context);
		context.watcher?.on("change", async (path) => {
			if (path.endsWith(".md") && existsSync(path)) await load(context);
		});
	},
});
