/** Where repository files appear on the site, and the guide's order for the sidebar. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { REPO_ROOT } from "./repo.ts";

export const GUIDE_PREFIX = "guide";
export const PACKAGES_PREFIX = "reference/packages";

/** `animation.md` becomes `guide/animation`; the guide's README is the guide's index. */
export const guideSlug = (fileName: string) =>
	fileName === "README.md" ? GUIDE_PREFIX : `${GUIDE_PREFIX}/${fileName.replace(/\.md$/, "")}`;

type PackageJson = { name: string; description?: string; private?: boolean };

export type PackagePage = {
	slug: string;
	name: string;
	description: string | undefined;
	readme: string;
	dir: string;
};

/** Published packages (not private) that have a README, sorted by name. */
export const packagePages = (): PackagePage[] => {
	const base = join(REPO_ROOT, "packages");
	return readdirSync(base)
		.flatMap((dir) => {
			const readme = join(base, dir, "README.md");
			const manifest = join(base, dir, "package.json");
			if (!existsSync(readme) || !existsSync(manifest)) return [];
			const pkg = JSON.parse(readFileSync(manifest, "utf8")) as PackageJson;
			if (pkg.private) return [];
			return [
				{
					slug: `${PACKAGES_PREFIX}/${dir}`,
					name: pkg.name,
					description: pkg.description,
					readme,
					dir,
				},
			];
		})
		.sort((a, b) => a.name.localeCompare(b.name));
};

/** Every published package, for the landing page. */
export const publishedPackages = () => {
	const base = join(REPO_ROOT, "packages");
	return readdirSync(base).flatMap((dir) => {
		const manifest = join(base, dir, "package.json");
		if (!existsSync(manifest)) return [];
		const pkg = JSON.parse(readFileSync(manifest, "utf8")) as PackageJson;
		return pkg.private ? [] : [{ dir, name: pkg.name, description: pkg.description ?? "" }];
	});
};

/**
 * Site route of a repository file, or undefined when the site has no page for it.
 * `absPath` is an absolute path without the hash.
 */
export const routeOfRepoFile = (absPath: string): string | undefined => {
	const rel = relative(REPO_ROOT, absPath).split(sep).join("/");
	if (rel === "README.md") return "/";
	const guide = /^docs\/guide\/([^/]+\.md)$/.exec(rel);
	if (guide?.[1]) return `/${guideSlug(guide[1])}/`;
	const pkg = /^packages\/([^/]+)\/README\.md$/.exec(rel);
	if (pkg?.[1]) {
		const page = packagePages().find((p) => p.dir === pkg[1]);
		if (page) return `/${page.slug}/`;
	}
	return undefined;
};

type SidebarLink = { label: string; slug: string };
type SidebarGroup = { label: string; items: SidebarLink[] };

/**
 * The guide's sidebar, in the order of the numbered list in `docs/guide/README.md`: a numbered
 * item with a link is a page, one without a link is a group of the bulleted links below it.
 */
export const guideSidebar = (): (SidebarLink | SidebarGroup)[] => {
	const readme = readFileSync(join(REPO_ROOT, "docs", "guide", "README.md"), "utf8");
	const items: (SidebarLink | SidebarGroup)[] = [{ label: "Overview", slug: GUIDE_PREFIX }];
	let group: SidebarGroup | undefined;
	for (const line of readme.split("\n")) {
		const numbered = /^\d+\.\s+(.*)$/.exec(line);
		const bullet = /^\s+[-*]\s+(.*)$/.exec(line);
		const text = numbered?.[1] ?? bullet?.[1];
		if (text === undefined) continue;
		const link = /^\[([^\]]+)\]\(([^)#]+\.md)\)/.exec(text);
		if (numbered) {
			group = undefined;
			if (link?.[1] && link[2]) items.push({ label: link[1], slug: guideSlug(link[2]) });
			else {
				group = { label: text.trim(), items: [] };
				items.push(group);
			}
		} else if (bullet && group && link?.[1] && link[2]) {
			group.items.push({ label: link[1], slug: guideSlug(link[2]) });
		}
	}
	return items;
};
