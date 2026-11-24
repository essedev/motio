/**
 * The site's `llms.txt` and `llms-full.txt` (the llmstxt.org format): an index of the docs and
 * their full text as Markdown, for language models and coding agents. Built from the same entries
 * as the docs collection (`docs-loader.ts`), so nothing is copied.
 */
import { cliEntries, type Entry, guideEntries, packageEntries } from "./docs-loader.ts";
import { guideSidebar } from "./pages.ts";
import { SITE_URL } from "./repo.ts";
import { rewriteRepoLink } from "./repo-links.ts";

const pageUrl = (id: string) => `${SITE_URL}/${id}/`;

/** The guide's entries in the sidebar's order; pages missing from the sidebar come last. */
const orderedGuide = (): Entry[] => {
	const order = guideSidebar()
		.flatMap((item) => ("items" in item ? item.items : [item]))
		.map((link) => link.slug);
	const rank = (id: string) => {
		const i = order.indexOf(id);
		return i === -1 ? order.length : i;
	};
	return guideEntries().sort((a, b) => rank(a.id) - rank(b.id));
};

const sections = (): { heading: string; entries: Entry[] }[] => [
	{ heading: "Guide", entries: orderedGuide() },
	{ heading: "CLI reference", entries: cliEntries() },
	{ heading: "Packages", entries: packageEntries() },
];

/**
 * A Markdown body with its links made absolute: a relative link to a repository file becomes the
 * URL of its page on the site (or on GitHub), a site path gets the site's origin.
 */
const absoluteLinks = (entry: Entry) =>
	entry.body.replace(/\]\(([^)\s]+)\)/g, (match, url: string) => {
		if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return match;
		if (url.startsWith("#")) return `](${pageUrl(entry.id)}${url})`;
		const target = url.startsWith("/") || !entry.file ? url : rewriteRepoLink(url, entry.file);
		return `](${target.startsWith("/") ? `${SITE_URL}${target}` : target})`;
	});

const SUMMARY =
	"Make videos with React. Open source (Apache-2.0), compatible with Remotion's documented API: " +
	"React components rendered frame by frame in a pinned headless Chrome and encoded with FFmpeg.";

/** The text of `/llms.txt`: what Motio is, then one link per page with its description. */
export const llmsIndex = (): string => {
	const lines = [
		"# Motio",
		"",
		`> ${SUMMARY}`,
		"",
		"Frames render in any order and in several browser tabs, so a frame's pixels must depend " +
			"only on its number and the props: time comes from `useCurrentFrame()`, asynchronous work " +
			"is held with `delayRender()`, and `motio check determinism` verifies a composition. " +
			`[Frames and time](${pageUrl("guide/frames-and-time")}) has the rules.`,
	];
	for (const { heading, entries } of sections()) {
		lines.push("", `## ${heading}`, "");
		for (const entry of entries) {
			const description = entry.description ? `: ${entry.description}` : "";
			lines.push(`- [${entry.title}](${pageUrl(entry.id)})${description}`);
		}
	}
	lines.push(
		"",
		"## Optional",
		"",
		`- [Full text](${SITE_URL}/llms-full.txt): every page above in one Markdown file.`,
		"",
	);
	return lines.join("\n");
};

/** The text of `/llms-full.txt`: every page of the index, in the same order, as Markdown. */
export const llmsFull = (): string => {
	const pages = sections().flatMap(({ entries }) =>
		entries.map(
			(entry) =>
				`# ${entry.title}\n\nSource: ${pageUrl(entry.id)}\n\n${absoluteLinks(entry).trim()}\n`,
		),
	);
	return [`# Motio\n\n> ${SUMMARY}\n`, ...pages].join("\n");
};
