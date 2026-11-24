/**
 * Rewrites relative links in Markdown read from the repository (the guide, package READMEs) so
 * the files stay readable on GitHub and work on the site: a link to a page the site renders
 * becomes its route, a link to any other repository file becomes its GitHub URL. Files outside
 * the repository are left alone.
 */
import { existsSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { routeOfRepoFile } from "./pages.ts";
import { REPO_ROOT, repoBlobUrl } from "./repo.ts";

const isExternal = (url: string) => /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//");

export const rewriteRepoLink = (url: string, fromFile: string): string => {
	if (!url || isExternal(url) || url.startsWith("#") || url.startsWith("/")) return url;
	const hashAt = url.indexOf("#");
	const path = hashAt === -1 ? url : url.slice(0, hashAt);
	const hash = hashAt === -1 ? "" : url.slice(hashAt);
	const target = resolve(dirname(fromFile), decodeURI(path));
	const rel = relative(REPO_ROOT, target).split(sep).join("/");
	if (rel.startsWith("..")) return url;
	const route = routeOfRepoFile(target);
	if (route) return `${route}${hash}`;
	if (!existsSync(target)) {
		throw new Error(
			`Broken link "${url}" in ${relative(REPO_ROOT, fromFile)}: ${rel} does not exist.`,
		);
	}
	return `${repoBlobUrl(rel, statSync(target).isDirectory() ? "tree" : "blob")}${hash}`;
};

type LinkNode = { url: string };
type Ctx = { setProperty: (node: LinkNode, key: "url", value: string) => void };

/**
 * Sätteri mdast plugin factory: applies `rewriteRepoLink` to links and link definitions of
 * Markdown files inside the repository.
 */
export const repoLinksPlugin = ({ fileURL }: { fileURL: URL | undefined }) => {
	if (fileURL?.protocol !== "file:") return null;
	const from = fileURLToPath(fileURL);
	if (relative(REPO_ROOT, from).startsWith("..")) return null;
	const fix = (node: LinkNode, ctx: Ctx) => {
		const url = rewriteRepoLink(node.url, from);
		if (url !== node.url) ctx.setProperty(node, "url", url);
	};
	return { name: "motio-repo-links", link: fix, definition: fix };
};
