// Renders the third-party Remotion projects of the M4 proof (fixtures/projects/projects.json) with
// the published Remotion at the pinned version: resolved composition metadata and reference stills
// at the frames sampleFrames() picks, written to
// fixtures/projects/.cache/golden/remotion/<project>/<entry>/ (ignored: never committed).
// Each project is fetched at its pinned commit (never vendored) and copied unchanged, without .git,
// next to this project so that remotion and @remotion/* resolve to the pinned packages here and
// the third-party packages to the versions in this package.json. Each entry is bundled the way the
// project's own script bundles it: webpack aliases from the project's tsconfig paths (the
// project's own scripts/tsconfig-webpack-alias.mts) and, where that script does it,
// enableTailwind() and ignoreRegisterRootWarning. The working directory is the project, as when
// its scripts run (Tailwind finds its sources from it).
// With --around-flagged it renders, instead, the frames around those `motio check flicker` flagged
// in the last run of the M4 test (fixtures/projects/.cache/results/<project>.json), into each
// composition's around/ directory, so the test can tell the content's own motion from flicker.
// Public APIs only (clean room: never open files under node_modules).
// Run: pnpm record:projects [--around-flagged] [project[/entry]...]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { bundle } from "@remotion/bundler";
import { getCompositions, openBrowser, renderStill } from "@remotion/renderer";
import { enableTailwind } from "@remotion/tailwind-v4";
import {
	AROUND_DIR,
	CACHE_DIR,
	fetchProject,
	framesAround,
	GL,
	GOLDEN_DIR,
	type ProjectEntry,
	readProjects,
	SCALE,
	sampleFrames,
	stillName,
} from "../../fixtures/projects/projects.ts";

interface AliasItem {
	name: string;
	alias: string;
	onlyModule: boolean;
}

/** What the M4 test writes per project: the flicker check's flagged frames per composition. */
interface Results {
	entries: Record<string, { compositions: Record<string, { flicker?: { flagged?: number[] } }> }>;
}

const here = import.meta.dirname;
const version = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).dependencies
	.remotion as string;
const projects = readProjects();
const args = process.argv.slice(2);
const aroundFlagged = args.includes("--around-flagged");
const filters = args.filter((arg) => !arg.startsWith("--"));
const wanted = (project: string, entry: string) =>
	filters.length === 0 || filters.includes(project) || filters.includes(`${project}/${entry}`);
const chromiumOptions = { gl: GL } as const;

/** Flagged frames per entry and composition from the last test run, or null without results. */
function flaggedFrames(project: string): Map<string, Map<string, number[]>> | null {
	const file = join(CACHE_DIR, "results", `${project}.json`);
	if (!existsSync(file)) return null;
	const results = JSON.parse(readFileSync(file, "utf8")) as Results;
	const byEntry = new Map<string, Map<string, number[]>>();
	for (const [entry, { compositions }] of Object.entries(results.entries)) {
		for (const [id, composition] of Object.entries(compositions)) {
			const flagged = composition.flicker?.flagged ?? [];
			if (flagged.length === 0) continue;
			if (!byEntry.has(entry)) byEntry.set(entry, new Map());
			byEntry.get(entry)?.set(id, flagged);
		}
	}
	return byEntry;
}

for (const [name, project] of Object.entries(projects)) {
	const flagged = aroundFlagged ? flaggedFrames(name) : null;
	if (aroundFlagged && !flagged) {
		console.log(`${name}: no results of the M4 test, nothing flagged to record around`);
		continue;
	}
	const entries = Object.entries(project.entries).filter(
		([id]) => wanted(name, id) && (!flagged || flagged.has(id)),
	);
	if (entries.length === 0) continue;
	const source = fetchProject(name);
	const work = resolve(here, ".work-projects", name);
	rmSync(work, { recursive: true, force: true });
	cpSync(source, work, { recursive: true, filter: (path) => !path.endsWith("/.git") });
	const aliasModule = (await import(
		pathToFileURL(join(work, "scripts/tsconfig-webpack-alias.mts")).href
	)) as { tsconfigWebpackAlias: (root: string) => AliasItem[] };
	const aliases = aliasModule.tsconfigWebpackAlias(work);
	const bundleEntry = (entry: ProjectEntry) =>
		bundle({
			entryPoint: join(work, entry.file),
			ignoreRegisterRootWarning: entry.ignoreRegisterRootWarning ?? false,
			webpackOverride: (raw) => {
				const config = entry.tailwind ? enableTailwind(raw) : raw;
				// The projects' scripts fold Remotion's alias object into the ordered array form,
				// first match wins, then append the tsconfig aliases (most specific first).
				const existing = Object.entries(config.resolve?.alias ?? {}).map(([key, alias]) => ({
					name: key.replace(/\$$/, ""),
					alias: alias as string,
					onlyModule: key.endsWith("$"),
				}));
				return { ...config, resolve: { ...config.resolve, alias: [...existing, ...aliases] } };
			},
		});
	const previousCwd = process.cwd();
	process.chdir(work);
	const browser = await openBrowser("chrome", { chromiumOptions });
	try {
		for (const [id, entry] of entries) {
			const out = join(GOLDEN_DIR, name, id);
			if (flagged) {
				const serveUrl = await bundleEntry(entry);
				const comps = await getCompositions(serveUrl, {
					inputProps: {},
					chromiumOptions,
					puppeteerInstance: browser,
				});
				for (const [compositionId, frames] of flagged.get(id) ?? []) {
					const composition = comps.find((c) => c.id === compositionId);
					if (!composition) throw new Error(`${name}/${id}: no composition ${compositionId}`);
					const around = framesAround(frames, composition.durationInFrames);
					const dir = join(out, compositionId, AROUND_DIR);
					mkdirSync(dir, { recursive: true });
					for (const frame of around) {
						await renderStill({
							composition,
							serveUrl,
							frame,
							scale: SCALE,
							imageFormat: "png",
							output: join(dir, stillName(frame)),
							inputProps: {},
							chromiumOptions,
							puppeteerInstance: browser,
						});
					}
					console.log(`${name}/${id} ${compositionId}: ${around.length} frames around the flagged`);
				}
				continue;
			}
			rmSync(out, { recursive: true, force: true });
			mkdirSync(out, { recursive: true });
			const metadata: Record<string, unknown> = {
				remotion: version,
				project: { repository: project.repository, commit: project.commit },
				entry: entry.file,
				scale: SCALE,
				gl: GL,
			};
			let serveUrl: string;
			try {
				serveUrl = await bundleEntry(entry);
			} catch (error) {
				// Remotion itself cannot build this entry: recorded, so the test reports it as such.
				metadata.bundleError = error instanceof Error ? error.message : String(error);
				writeFileSync(join(out, "metadata.json"), `${JSON.stringify(metadata, null, "\t")}\n`);
				console.log(`${name}/${id}: Remotion cannot bundle it: ${metadata.bundleError}`);
				continue;
			}
			const comps = await getCompositions(serveUrl, {
				inputProps: {},
				chromiumOptions,
				puppeteerInstance: browser,
			});
			const compositions: Record<string, unknown> = {};
			for (const composition of comps) {
				const frames = sampleFrames(composition.durationInFrames);
				const record: Record<string, unknown> = {
					width: composition.width,
					height: composition.height,
					fps: composition.fps,
					durationInFrames: composition.durationInFrames,
					defaultProps: composition.defaultProps,
					props: composition.props,
					frames,
				};
				const dir = join(out, composition.id);
				mkdirSync(dir, { recursive: true });
				const failures: Record<string, string> = {};
				for (const frame of frames) {
					try {
						await renderStill({
							composition,
							serveUrl,
							frame,
							scale: SCALE,
							imageFormat: "png",
							output: join(dir, stillName(frame)),
							inputProps: {},
							chromiumOptions,
							puppeteerInstance: browser,
						});
					} catch (error) {
						failures[frame] = error instanceof Error ? error.message : String(error);
					}
				}
				if (Object.keys(failures).length > 0) record.renderErrors = failures;
				compositions[composition.id] = record;
				console.log(
					`${name}/${id} ${composition.id}: ${frames.length - Object.keys(failures).length}/${frames.length} stills`,
				);
			}
			metadata.compositions = compositions;
			writeFileSync(join(out, "metadata.json"), `${JSON.stringify(metadata, null, "\t")}\n`);
		}
	} finally {
		await browser.close({ silent: true });
		process.chdir(previousCwd);
		rmSync(work, { recursive: true, force: true });
	}
}
rmSync(join(here, ".work-projects"), { recursive: true, force: true });
