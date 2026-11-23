import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MotioError } from "./errors.js";

/** Where the FFmpeg of a render came from. */
export type FfmpegSource = "option" | "env" | "package" | "path";

/** The FFmpeg and ffprobe a render uses. */
export interface ResolvedFfmpeg {
	ffmpeg: string;
	ffprobe: string;
	source: FfmpegSource;
	/** Set when `source` is `package`: the pinned build's version and build number. */
	pinned?: { version: string; build: number };
}

/** Options naming FFmpeg explicitly. */
export interface FfmpegExecutableOptions {
	/** Motio extension: FFmpeg executable. */
	ffmpegExecutable?: string | null | undefined;
	/** Motio extension: FFprobe executable. */
	ffprobeExecutable?: string | null | undefined;
}

/** The part of `@motiojs/ffmpeg` the renderer calls. */
export interface FfmpegPackage {
	ensureFfmpeg(options?: {
		onProgress?: (progress: { downloadedBytes: number; totalBytes: number }) => void;
	}): Promise<{ ffmpeg: string; ffprobe: string; version: string; build: number }>;
	findFfmpeg?(): Promise<{
		ffmpeg: string;
		ffprobe: string;
		version: string;
		build: number;
	} | null>;
}

const PACKAGE = "@motiojs/ffmpeg";

/**
 * The folder of `@motiojs/ffmpeg` in the nearest `node_modules` above `start`, or null. A plain
 * walk up the folders, like Node's own lookup but without `NODE_PATH`: `pnpm exec` points
 * `NODE_PATH` at the store's hoisted folder, where every package of a workspace is visible
 * whether the project depends on it or not.
 */
export function findPackageDir(start: string, name: string = PACKAGE): string | null {
	let dir = resolve(start);
	for (;;) {
		const candidate = join(dir, "node_modules", ...name.split("/"));
		if (existsSync(join(candidate, "package.json"))) return candidate;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/** The entry module of an installed package: `exports["."]` (its `default`), else `main`. */
async function entryOf(dir: string): Promise<string> {
	const manifest = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as {
		exports?: string | Record<string, string | Record<string, string>>;
		main?: string;
	};
	const dot = typeof manifest.exports === "string" ? manifest.exports : manifest.exports?.["."];
	const entry = typeof dot === "string" ? dot : (dot?.import ?? dot?.default ?? manifest.main);
	return join(dir, entry ?? "index.js");
}

/**
 * Loads `@motiojs/ffmpeg` if it is installed, or returns null. It is never a dependency of the
 * renderer: it is looked up from the renderer's own location (which reaches the project's
 * `node_modules` with npm, pnpm and Yarn's node_modules linker) and from the working directory
 * (for a globally installed CLI).
 */
export async function loadFfmpegPackage(
	starts: readonly string[] = [dirname(fileURLToPath(import.meta.url)), process.cwd()],
): Promise<FfmpegPackage | null> {
	for (const start of starts) {
		const dir = findPackageDir(start);
		if (dir) return (await import(pathToFileURL(await entryOf(dir)).href)) as FfmpegPackage;
	}
	return null;
}

/** The ffprobe next to an FFmpeg path (`/x/ffmpeg` gives `/x/ffprobe`), else `ffprobe`. */
export function siblingFfprobe(ffmpeg: string): string {
	const m = /^(.*[\\/])ffmpeg(\.exe)?$/i.exec(ffmpeg);
	return m ? `${m[1]}ffprobe${m[2] ?? ""}` : "ffprobe";
}

/** Dependencies of `resolveFfmpeg`, replaceable in tests. */
export interface ResolveFfmpegDeps {
	env: Record<string, string | undefined>;
	loadPackage: () => Promise<FfmpegPackage | null>;
}

let packagePromise: Promise<FfmpegPackage | null> | undefined;
const defaultDeps = (): ResolveFfmpegDeps => ({
	env: process.env,
	loadPackage: () => {
		packagePromise ??= loadFfmpegPackage();
		return packagePromise;
	},
});

/**
 * Chooses the FFmpeg and ffprobe of a render, in this order:
 *
 * 1. `ffmpegExecutable` (and `ffprobeExecutable`) passed to the call;
 * 2. `$MOTIO_FFMPEG` (and `$MOTIO_FFPROBE`);
 * 3. `@motiojs/ffmpeg`, when it is installed: its pinned build, downloaded on first use unless
 *    `download` is false;
 * 4. `ffmpeg` and `ffprobe` on `PATH`.
 *
 * Without an explicit ffprobe, an FFmpeg given as a path takes the `ffprobe` next to it.
 * With `download: false` an installed but not yet downloaded package resolves to null, so a
 * diagnostic can report it without starting a download.
 */
export async function resolveFfmpeg(
	options: FfmpegExecutableOptions & {
		download?: boolean;
		onDownloadProgress?: (progress: { downloadedBytes: number; totalBytes: number }) => void;
	} = {},
	deps: ResolveFfmpegDeps = defaultDeps(),
): Promise<ResolvedFfmpeg | null> {
	const explicitProbe = options.ffprobeExecutable || deps.env.MOTIO_FFPROBE || undefined;
	if (options.ffmpegExecutable) {
		return {
			ffmpeg: options.ffmpegExecutable,
			ffprobe: explicitProbe ?? siblingFfprobe(options.ffmpegExecutable),
			source: "option",
		};
	}
	if (deps.env.MOTIO_FFMPEG) {
		return {
			ffmpeg: deps.env.MOTIO_FFMPEG,
			ffprobe: explicitProbe ?? siblingFfprobe(deps.env.MOTIO_FFMPEG),
			source: "env",
		};
	}
	const pkg = await deps.loadPackage();
	if (pkg) {
		let pinned: Awaited<ReturnType<FfmpegPackage["ensureFfmpeg"]>> | null;
		if (options.download === false) {
			pinned = (await pkg.findFfmpeg?.()) ?? null;
			if (!pinned) return null;
		} else {
			pinned = await pkg.ensureFfmpeg(
				options.onDownloadProgress ? { onProgress: options.onDownloadProgress } : {},
			);
		}
		return {
			ffmpeg: pinned.ffmpeg,
			ffprobe: explicitProbe ?? pinned.ffprobe,
			source: "package",
			pinned: { version: pinned.version, build: pinned.build },
		};
	}
	return { ffmpeg: "ffmpeg", ffprobe: explicitProbe ?? "ffprobe", source: "path" };
}

/** `resolveFfmpeg` for a render: downloads the pinned build when needed, never returns null. */
export async function resolveRenderFfmpeg(
	options: FfmpegExecutableOptions = {},
	deps?: ResolveFfmpegDeps,
): Promise<ResolvedFfmpeg> {
	const resolved = await resolveFfmpeg(options, deps);
	if (!resolved) {
		throw new MotioError("E_FFMPEG_NOT_FOUND", "FFmpeg could not be resolved.");
	}
	return resolved;
}
