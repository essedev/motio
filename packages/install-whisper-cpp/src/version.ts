import { join } from "node:path";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** Whether `version` is a release number such as `1.5.5` (else it is a commit). */
export const isSemver = (version: string) => SEMVER.test(version);

/** The git revision to check out: `v1.5.5` for a release, the commit itself otherwise. */
export const gitRevision = (version: string) => (isSemver(version) ? `v${version}` : version);

/** Whether release `version` is `major.minor.patch` or later. */
function atLeast(version: string, major: number, minor: number, patch: number): boolean {
	const match = SEMVER.exec(version);
	if (!match) return false;
	const parts = match.slice(1).map(Number) as [number, number, number];
	for (const [i, wanted] of [major, minor, patch].entries()) {
		if (parts[i] !== wanted) return (parts[i] as number) > wanted;
	}
	return true;
}

/**
 * The executable a build of `version` produces in `whisperPath`: `build/bin/whisper-cli` from
 * whisper.cpp 1.7.4 on, `main` before. For a commit, the one that exists (whisper-cli first).
 */
export function whisperExecutable(
	whisperPath: string,
	version: string,
	exists: (path: string) => boolean,
): string {
	const cli = join(whisperPath, "build", "bin", "whisper-cli");
	const main = join(whisperPath, "main");
	if (isSemver(version)) return atLeast(version, 1, 7, 4) ? cli : main;
	return exists(cli) ? cli : main;
}
