/**
 * Fails when a built page links to something the build does not contain: every internal `href`
 * and `src` in `dist/**.html` must resolve to a file, and its `#fragment` to an element id in the
 * target page. Absolute links to the site's own host (package READMEs use them, so they work on
 * npm too) count as internal. Links that leave the site are not fetched. Run after `astro build`
 * (`pnpm build`).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SITE_URL, SITE_URL } from "../src/lib/repo.ts";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");

/** Hosts whose absolute links are checked like relative ones. */
const ownOrigins = new Set([new URL(DEFAULT_SITE_URL).origin, new URL(SITE_URL).origin]);
const ownUrl = (raw: string) => {
	if (!/^https?:\/\//i.test(raw)) return undefined;
	const url = new URL(raw);
	return ownOrigins.has(url.origin) ? url : undefined;
};

const htmlFiles = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return htmlFiles(path);
		return name.endsWith(".html") ? [path] : [];
	});

const ids = new Map<string, Set<string>>();
const idsOf = (file: string) => {
	let set = ids.get(file);
	if (!set) {
		set = new Set();
		for (const m of readFileSync(file, "utf8").matchAll(/\sid=(?:"([^"]+)"|'([^']+)')/g)) {
			set.add(m[1] ?? m[2] ?? "");
		}
		ids.set(file, set);
	}
	return set;
};

/** The file a site path is served from, or undefined. */
const resolveTarget = (path: string) => {
	const decoded = decodeURIComponent(path);
	const candidates = decoded.endsWith("/")
		? [join(dist, decoded, "index.html"), join(dist, `${decoded.slice(0, -1)}.html`)]
		: [join(dist, decoded), join(dist, decoded, "index.html"), join(dist, `${decoded}.html`)];
	return candidates.find((c) => existsSync(c) && statSync(c).isFile());
};

const problems: string[] = [];
const pages = htmlFiles(dist);
let checked = 0;
for (const page of pages) {
	const html = readFileSync(page, "utf8");
	const pagePath = `/${relative(dist, page).replace(/index\.html$/, "")}`;
	for (const m of html.matchAll(/\s(href|src)=(?:"([^"]*)"|'([^']*)')/g)) {
		const raw = (m[2] ?? m[3] ?? "").replaceAll("&amp;", "&");
		const own = ownUrl(raw);
		if (!raw || (!own && /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw))) continue;
		checked++;
		const url = own ?? new URL(raw, `https://site${pagePath}`);
		const target =
			url.pathname === pagePath && raw.startsWith("#") ? page : resolveTarget(url.pathname);
		if (!target) {
			problems.push(`${pagePath}: ${raw} does not exist`);
			continue;
		}
		const hash = decodeURIComponent(url.hash.slice(1));
		if (hash && target.endsWith(".html") && !idsOf(target).has(hash)) {
			problems.push(`${pagePath}: ${raw} has no element with id "${hash}"`);
		}
	}
}

if (problems.length > 0) {
	console.error(`Broken links (${problems.length}):\n${problems.map((p) => `  ${p}`).join("\n")}`);
	process.exit(1);
}
console.log(`Links: ${checked} internal links in ${pages.length} pages, all resolve.`);
