import { existsSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { MotioError } from "@motiojs/compat";

/** Files tried in order when no entry point is given (Remotion's documented list). */
export const ENTRY_POINT_CANDIDATES: readonly string[] = [
	"src/index.ts",
	"src/index.tsx",
	"src/index.js",
	"src/index.mjs",
	"remotion/index.tsx",
	"remotion/index.ts",
	"remotion/index.js",
	"remotion/index.mjs",
	"src/remotion/index.tsx",
	"src/remotion/index.ts",
	"src/remotion/index.js",
	"src/remotion/index.mjs",
];

/** Where the entry point came from, printed by the CLI as Remotion does. */
export type EntryPointReason = "argument" | "config" | "common paths";

export interface ResolvedEntryPoint {
	/** Absolute path of the entry file. */
	path: string;
	reason: EntryPointReason;
}

export interface ResolveEntryPointOptions {
	/** Project root; relative paths resolve against it. */
	rootDir: string;
	/** From the command line or the `entryPoint` option. */
	entryPoint?: string | undefined;
	/** From `Config.setEntryPoint()`. */
	configEntryPoint?: string | undefined;
}

function isFile(path: string): boolean {
	return existsSync(path) && statSync(path).isFile();
}

/**
 * Finds the entry file: the explicit argument, then `Config.setEntryPoint()`, then the first
 * existing common path. Throws `E_ENTRY_POINT_NOT_FOUND` with every path tried.
 */
export function resolveEntryPoint(options: ResolveEntryPointOptions): ResolvedEntryPoint {
	const rootDir = resolve(options.rootDir);
	const explicit: Array<[string | undefined, EntryPointReason]> = [
		[options.entryPoint, "argument"],
		[options.configEntryPoint, "config"],
	];
	for (const [candidate, reason] of explicit) {
		if (!candidate) continue;
		const path = isAbsolute(candidate) ? candidate : join(rootDir, candidate);
		if (!isFile(path)) {
			throw new MotioError(
				"E_ENTRY_POINT_NOT_FOUND",
				`The entry point ${path} (from the ${reason === "argument" ? "command line or options" : "config file"}) does not exist.`,
				{ path, reason },
			);
		}
		return { path, reason };
	}
	for (const candidate of ENTRY_POINT_CANDIDATES) {
		const path = join(rootDir, candidate);
		if (isFile(path)) return { path, reason: "common paths" };
	}
	throw new MotioError(
		"E_ENTRY_POINT_NOT_FOUND",
		`No entry point found in ${rootDir}. Pass the file that calls registerRoot() as an argument, or create one of: ${ENTRY_POINT_CANDIDATES.join(", ")}.`,
		{ rootDir, tried: ENTRY_POINT_CANDIDATES },
	);
}
