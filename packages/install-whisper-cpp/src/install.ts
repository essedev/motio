import { existsSync, readdirSync } from "node:fs";
import { run, runOrThrow } from "./run.js";
import { gitRevision, whisperExecutable } from "./version.js";

/** The repository whisper.cpp is cloned from, as the published package clones it. */
export const WHISPER_CPP_REPOSITORY = "https://github.com/ggerganov/whisper.cpp.git";

/** Options of {@link installWhisperCpp}. */
export interface InstallWhisperCppOptions {
	/** Folder to install whisper.cpp into (add it to `.gitignore`). */
	to: string;
	/** A whisper.cpp release such as `1.5.5` (no `v`), or a commit hash. */
	version: string;
	/** Print the output of git and the build. Default `true`. */
	printOutput?: boolean;
	/** Cancels the installation. */
	signal?: AbortSignal | null;
}

/** Result of {@link installWhisperCpp}. */
export interface InstallWhisperCppResult {
	/** Whether `to` already held a whisper.cpp build, in which case nothing was done. */
	alreadyExisted: boolean;
}

/**
 * Installs whisper.cpp into a folder: clones the repository, checks out the release (`v` +
 * `version`) or commit and builds it with `make` (from 1.7.3 the Makefile calls CMake, which must
 * be installed). When the folder already holds the executable, does nothing and resolves to
 * `{ alreadyExisted: true }`. Needs git and a C++ toolchain; Windows is not supported yet.
 */
export async function installWhisperCpp(
	options: InstallWhisperCppOptions,
): Promise<InstallWhisperCppResult> {
	const { to, version, printOutput = true, signal } = options;
	const executable = whisperExecutable(to, version, existsSync);
	if (existsSync(executable)) return { alreadyExisted: true };
	if (process.platform === "win32") {
		throw new Error(
			"installWhisperCpp() does not support Windows yet: download a whisper.cpp release from https://github.com/ggml-org/whisper.cpp/releases into the folder instead.",
		);
	}
	if (existsSync(to) && readdirSync(to).length > 0) {
		throw new Error(
			`installWhisperCpp(): ${to} exists but holds no whisper.cpp build (${executable} is missing). Delete the folder and try again.`,
		);
	}
	const print = printOutput;
	const runOptions = signal ? { print, signal } : { print };
	await runOrThrow("git", ["clone", WHISPER_CPP_REPOSITORY, to], runOptions);
	await runOrThrow("git", ["checkout", gitRevision(version)], { ...runOptions, cwd: to });
	const build = await run("make", [], { ...runOptions, cwd: to });
	if (!existsSync(executable)) {
		throw new Error(
			`installWhisperCpp(): building whisper.cpp ${version} did not produce ${executable} (make exited with code ${build.code}). From 1.7.3 the build needs CMake.\n${build.stderr}`,
		);
	}
	return { alreadyExisted: false };
}
