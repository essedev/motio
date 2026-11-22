import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { MotioError } from "./errors.js";

/** A file written under a temporary name and moved into place only on success. */
export interface PendingOutput {
	/** Where the producer writes. */
	temp: string;
	/** Final path, or null when the result is returned as a buffer. */
	final: string | null;
	/** Moves the temporary file into place. */
	commit(): Promise<void>;
	/** Removes the temporary file and directory, if any. */
	discard(): Promise<void>;
}

/** Throws `E_OUTPUT_EXISTS` if `path` exists and `overwrite` is false. */
export async function checkOverwrite(path: string, overwrite: boolean): Promise<void> {
	if (overwrite) return;
	const exists = await stat(path).then(
		() => true,
		(err: NodeJS.ErrnoException) => {
			if (err.code === "ENOENT") return false;
			throw err;
		},
	);
	if (exists) {
		throw new MotioError(
			"E_OUTPUT_EXISTS",
			`${path} already exists and overwrite is false. Delete it, choose another output or pass overwrite: true.`,
			{ details: { path } },
		);
	}
}

/**
 * Prepares an output: next to `location` when given (so the final rename stays on one file
 * system), else in a fresh temporary directory.
 */
export async function prepareOutput(
	location: string | null | undefined,
	overwrite: boolean,
	extension: string,
): Promise<PendingOutput> {
	if (location) {
		const final = resolve(location);
		await checkOverwrite(final, overwrite);
		await mkdir(dirname(final), { recursive: true });
		const temp = join(
			dirname(final),
			`.${basename(final)}.${process.pid}-${randomBytes(4).toString("hex")}.part${extension}`,
		);
		return {
			temp,
			final,
			commit: () => rename(temp, final),
			discard: () => rm(temp, { force: true }),
		};
	}
	const dir = await mkdtemp(join(tmpdir(), "motio-render-"));
	return {
		temp: join(dir, `out${extension}`),
		final: null,
		commit: async () => {},
		discard: () => rm(dir, { recursive: true, force: true }),
	};
}
