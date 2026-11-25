/**
 * Data of the landing page, read from the repository at build time so the page cannot drift from
 * it: the benchmark table of docs/ROADMAP.md, the pinned Remotion version of the benchmark, the
 * guide's example components, the published packages.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { publishedPackages } from "./pages.ts";
import { type PerfPlatform, parseBaselineVersion, parsePerformanceTable } from "./perf-table.ts";
import { REPO_ROOT } from "./repo.ts";

/**
 * A region of a guide example file, exactly as the guide shows it, through the guide's own
 * `exampleText()`. Imported at run time from its real path: bundled into the build, the module
 * would resolve the guide folder from the bundle's location.
 */
export const example = async (file: string, region?: string): Promise<string> => {
	const sync = pathToFileURL(join(REPO_ROOT, "docs", "guide", "examples", "sync.ts")).href;
	const mod = (await import(/* @vite-ignore */ sync)) as {
		exampleText: (file: string, region: string | undefined) => string;
	};
	return mod.exampleText(file, region);
};

export type { PerfPlatform, PerfRow } from "./perf-table.ts";

/** Version of Remotion the benchmark runs against (tools/oracle-render pins it). */
export const benchmarkBaselineVersion = (): string =>
	parseBaselineVersion(
		readFileSync(join(REPO_ROOT, "tools", "oracle-render", "package.json"), "utf8"),
	);

/** The performance table of docs/ROADMAP.md (see `parsePerformanceTable()`). */
export const performanceTable = (): PerfPlatform[] =>
	parsePerformanceTable(
		readFileSync(join(REPO_ROOT, "docs", "ROADMAP.md"), "utf8"),
		benchmarkBaselineVersion(),
	);

/** Packages shown on the landing page, with a one-line description written for it. */
const FEATURED: [dir: string, line: string][] = [
	["core", "Timeline, hooks, components and the animation functions."],
	["renderer", "Captures frames in headless Chrome and encodes them with FFmpeg, from Node."],
	["cli", "The motio command: render, still, frames, checks, doctor."],
	["player", "Plays a composition inside any React app, with a thumbnail component."],
	["bundler", "Builds a project with Vite: entry point, public folder, environment."],
	["transitions", "Fades, slides, wipes and flips between scenes."],
	["captions", "Reads, pages and shows captions from a transcript."],
	["media", "Video and audio that land on the exact frame in a render."],
	["google-fonts", "Google Fonts with types, holding the render until they load."],
	["three", "React Three Fiber scenes that follow the timeline."],
	["distributed", "Renders ranges of frames in parallel and joins them without re-encoding."],
	["ffmpeg", "A pinned FFmpeg checked against a SHA-256."],
];

export const packagesForLanding = () => {
	const all = publishedPackages();
	const featured = FEATURED.map(([dir, line]) => {
		const pkg = all.find((p) => p.dir === dir);
		if (!pkg) throw new Error(`Landing page features packages/${dir}, which is not published`);
		return { name: pkg.name, line };
	});
	const others = all
		.filter((p) => !FEATURED.some(([dir]) => dir === p.dir))
		.map((p) => p.name)
		.sort((a, b) => a.localeCompare(b));
	return { featured, others };
};
