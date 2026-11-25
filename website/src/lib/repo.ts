import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** GitHub owner of the repository, the same as `RELEASE_OWNER` in `@motiojs/ffmpeg`. */
export const REPO_OWNER = "essedev";
export const REPO_URL = `https://github.com/${REPO_OWNER}/motio`;
export const REPO_BRANCH = "main";

/**
 * Absolute path of the repository root: the nearest folder above the working directory that holds
 * `pnpm-workspace.yaml`. Found from the working directory rather than `import.meta.url`, which
 * points into bundled chunks once Astro builds the pages.
 */
export const REPO_ROOT = (() => {
	let dir = process.cwd();
	while (!existsSync(join(dir, "pnpm-workspace.yaml"))) {
		const parent = dirname(dir);
		if (parent === dir) throw new Error(`No pnpm-workspace.yaml above ${process.cwd()}`);
		dir = parent;
	}
	return dir;
})();

/**
 * Whether the packages are on npm. While false, the landing shows the `pnpm create motio`
 * commands without a copy button and links to the guide's way of trying Motio from a clone.
 */
export const NPM_PUBLISHED = false;

/** Where the guide explains how to try Motio before it is published. */
export const TRY_FROM_CLONE_HREF = "/guide/getting-started/#try-it-from-a-clone";

/** URL of a repository file or folder on GitHub. */
export const repoBlobUrl = (relPath: string, kind: "blob" | "tree" | "edit" = "blob") =>
	`${REPO_URL}/${kind}/${REPO_BRANCH}/${relPath.replace(/^\/+/, "")}`;

/** Where the site is published. Package READMEs link to it with absolute URLs, for npm. */
export const DEFAULT_SITE_URL = "https://motio.esse.dev";

/**
 * Public URL of the site, for canonical links and Open Graph images; `MOTIO_SITE_URL` builds for
 * another host (a preview deploy, for example).
 */
export const SITE_URL = (process.env.MOTIO_SITE_URL ?? DEFAULT_SITE_URL).replace(/\/$/, "");
