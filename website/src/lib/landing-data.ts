/**
 * Data of the landing page, read from the repository at build time so the page cannot drift from
 * it: the benchmark table of docs/ROADMAP.md, the pinned Remotion version of the benchmark, the
 * guide's example components, the published packages.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { publishedPackages } from "./pages.ts";
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

export type PerfRow = { concurrency: number; baseline: number; motio: number };
export type PerfPlatform = { id: string; label: string; rows: PerfRow[]; note: string };

/** Version of Remotion the benchmark runs against (tools/oracle-render pins it). */
export const benchmarkBaselineVersion = (): string => {
	const pkg = JSON.parse(
		readFileSync(join(REPO_ROOT, "tools", "oracle-render", "package.json"), "utf8"),
	) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
	const version = { ...pkg.devDependencies, ...pkg.dependencies }.remotion;
	if (!version) throw new Error("tools/oracle-render/package.json does not pin remotion");
	return version;
};

/**
 * The performance table of docs/ROADMAP.md: a header `| Platform | Concurrency 1 | 4 | 8 |` and
 * rows `| <platform>: Remotion / Motio | 6.54 / 1.75 s | ... |`. Throws if the table changes
 * shape, so the landing page never shows stale or misparsed numbers.
 */
export const performanceTable = (): PerfPlatform[] => {
	const roadmap = readFileSync(join(REPO_ROOT, "docs", "ROADMAP.md"), "utf8");
	const lines = roadmap.split("\n");
	const header = lines.findIndex((l) => /^\|\s*Platform\s*\|\s*Concurrency/.test(l));
	if (header === -1) throw new Error("docs/ROADMAP.md: performance table not found");
	const cells = (line: string) =>
		line
			.split("|")
			.slice(1, -1)
			.map((c) => c.trim());
	const concurrency = cells(lines[header] ?? "")
		.slice(1)
		.map((c) => Number(/(\d+)$/.exec(c)?.[1]));
	const version = benchmarkBaselineVersion();
	const platforms: PerfPlatform[] = [];
	for (const line of lines.slice(header + 2)) {
		if (!line.startsWith("|")) break;
		const [name = "", ...values] = cells(line);
		const label = name.replace(/:\s*Remotion\s*\/\s*Motio\s*$/, "");
		if (label === name) throw new Error(`docs/ROADMAP.md: unexpected performance row "${name}"`);
		const rows = values.map((v, i) => {
			const m = /^([\d.]+)\s*\/\s*([\d.]+)\s*s$/.exec(v);
			const c = concurrency[i];
			if (!m || c === undefined || Number.isNaN(c)) {
				throw new Error(`docs/ROADMAP.md: cannot read "${v}" in row "${name}"`);
			}
			return { concurrency: c, baseline: Number(m[1]), motio: Number(m[2]) };
		});
		const linux = /linux/i.test(label);
		const where = linux
			? `in the pinned Linux image (${/linux-\w+/.exec(label)?.[0] ?? "linux"})`
			: `on ${label}`;
		platforms.push({
			id: linux ? "linux" : "macos",
			label: linux ? `Linux image, ${/linux-(\w+)/.exec(label)?.[1] ?? ""}` : label,
			rows,
			note: `Measured with make bench against Remotion ${version} ${where}, 1920x1080.`,
		});
	}
	if (platforms.length === 0) throw new Error("docs/ROADMAP.md: performance table has no rows");
	return platforms;
};

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
	["ffmpeg", "An optional pinned FFmpeg, checked against a SHA-256."],
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
