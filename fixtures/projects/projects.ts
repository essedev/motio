// Fetches the third-party Remotion projects listed in projects.json at their pinned commits into
// .cache/<name> (gitignored). The projects are never vendored: the tests and the oracle call this
// before using them. A clean checkout already at the pinned commit is reused.
// Run: node fixtures/projects/projects.ts [name...]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export const PROJECTS_DIR = import.meta.dirname;
export const CACHE_DIR = join(PROJECTS_DIR, ".cache");
/** Remotion's renders of the projects: recorded locally, never committed. */
export const GOLDEN_DIR = join(CACHE_DIR, "golden", "remotion");

export interface ProjectEntry {
	/** File that calls `registerRoot`, relative to the project root. */
	file: string;
	/** The project's script or config that bundles this entry, which the oracle mirrors. */
	script: string;
	/** That script wraps the webpack config in `enableTailwind()`. */
	tailwind?: boolean;
	/** That script passes `ignoreRegisterRootWarning` to Remotion's `bundle()`. */
	ignoreRegisterRootWarning?: boolean;
	/** Compositions left out of the comparison, with the reason. */
	skip?: Record<string, string>;
	/** Compositions whose stills are expected to miss the thresholds, with the cause. */
	knownMismatch?: Record<string, string>;
	/** Compositions whose frames around flagged flicker differ from Remotion's for a known cause. */
	knownFlickerMismatch?: Record<string, string>;
}

export interface Project {
	repository: string;
	commit: string;
	entries: Record<string, ProjectEntry>;
	/** `registerRoot` files that are not measured, with the reason. */
	excluded: Record<string, string>;
}

/**
 * `chromiumOptions.gl` both renderers use: software WebGL, Motio's default backend (D-046). Set
 * explicitly, it also makes Motio rasterise on the GPU, as Remotion does with it (`raster`).
 */
export const GL = "swangle";

/** Scale of every reference still: below 1 the renderers rasterise differently (D-025). */
export const SCALE = 1;

/** How many frames of each composition are compared with Remotion's stills. */
export const SAMPLES = 5;

export function readProjects(): Record<string, Project> {
	const file = JSON.parse(readFileSync(join(PROJECTS_DIR, "projects.json"), "utf8")) as {
		projects: Record<string, Project>;
	};
	return file.projects;
}

/**
 * The frames of a composition compared with Remotion: the first, the last and evenly spaced ones
 * between them, without duplicates for short compositions.
 */
export function sampleFrames(durationInFrames: number, samples = SAMPLES): number[] {
	const last = Math.max(0, durationInFrames - 1);
	const frames = new Set<number>();
	for (let i = 0; i < samples; i++) {
		frames.add(Math.round((last * i) / Math.max(1, samples - 1)));
	}
	return [...frames].sort((a, b) => a - b);
}

/**
 * Directory, inside a composition's references, of Remotion's frames around the ones
 * `motio check flicker` flagged on Motio's render.
 */
export const AROUND_DIR = "around";

/** The flagged frames and their neighbours, within the composition. */
export function framesAround(flagged: readonly number[], durationInFrames: number): number[] {
	const frames = new Set<number>();
	for (const frame of flagged) {
		for (const f of [frame - 1, frame, frame + 1]) {
			if (f >= 0 && f < durationInFrames) frames.add(f);
		}
	}
	return [...frames].sort((a, b) => a - b);
}

/** File name of a reference still. */
export function stillName(frame: number): string {
	return `${String(frame).padStart(4, "0")}.png`;
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

/** Checks out one project at its pinned commit and returns its directory. */
export function fetchProject(name: string): string {
	const project = readProjects()[name];
	if (!project) throw new Error(`fixtures/projects/projects.json has no project "${name}"`);
	const directory = join(CACHE_DIR, name);
	if (headOf(directory) === project.commit && git(directory, ["status", "--porcelain"]) === "") {
		return directory;
	}
	rmSync(directory, { recursive: true, force: true });
	mkdirSync(directory, { recursive: true });
	git(directory, ["init", "--quiet"]);
	git(directory, ["fetch", "--quiet", "--depth", "1", project.repository, project.commit]);
	git(directory, ["-c", "advice.detachedHead=false", "checkout", "--quiet", "FETCH_HEAD"]);
	const head = headOf(directory);
	if (head !== project.commit) {
		throw new Error(`${name}: checked out ${head ?? "nothing"}, expected ${project.commit}`);
	}
	return directory;
}

if (process.argv[1] === import.meta.filename) {
	const names = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(readProjects());
	for (const name of names) console.log(`${name}: ${fetchProject(name)}`);
}
