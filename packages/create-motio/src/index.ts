import { type CliDeps, type CliIo, runCli } from "@motiojs/cli";

/**
 * Runs `motio init` with the arguments of `create-motio`, so `pnpm create motio my-video
 * --template blank` equals `motio init my-video --template blank`. Returns the exit code.
 */
export function createMotio(argv: readonly string[], io: CliIo, deps: CliDeps): Promise<number> {
	return runCli(["init", ...argv], io, deps);
}
