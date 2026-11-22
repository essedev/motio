import {
	copyFile,
	lstat,
	mkdir,
	readdir,
	readlink,
	realpath,
	stat,
	symlink,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

/** One file of the public directory, as returned by `getStaticFiles()`. */
export interface StaticFile {
	/** Path relative to the public directory, forward slashes. */
	name: string;
	/** URL the page loads it from. */
	src: string;
	sizeInBytes: number;
	/** Unix time in milliseconds. */
	lastModified: number;
}

/** Remotion lists at most this many static files. */
export const STATIC_FILES_LIMIT = 10_000;

export interface CopyPublicDirOptions {
	/** Called with the bytes copied so far. */
	onProgress?: (bytes: number) => void;
	/** Called for each symlink, which is recreated pointing at the original target. */
	onSymlinkDetected?: (path: string) => void;
}

/** Encodes each path segment like Remotion's `staticFile()`, keeping the slashes. */
export function encodeStaticPath(name: string): string {
	return name
		.split("/")
		.filter((segment) => segment.length > 0)
		.map(encodeURIComponent)
		.join("/");
}

/**
 * Copies `source` to `destination` and lists its files. Symlinks are forwarded rather than
 * copied (as Remotion does), so the bundle breaks if their target is removed.
 */
export async function copyPublicDir(
	source: string,
	destination: string,
	staticBase: string,
	options: CopyPublicDirOptions = {},
): Promise<StaticFile[]> {
	const files: StaticFile[] = [];
	let bytes = 0;
	const walk = async (directory: string): Promise<void> => {
		const entries = await readdir(directory, { withFileTypes: true });
		entries.sort((a, b) => a.name.localeCompare(b.name));
		for (const entry of entries) {
			const from = join(directory, entry.name);
			const name = relative(source, from).split("\\").join("/");
			const to = join(destination, name);
			if (entry.isDirectory()) {
				await mkdir(to, { recursive: true });
				await walk(from);
				continue;
			}
			await mkdir(dirname(to), { recursive: true });
			let info = await lstat(from);
			if (info.isSymbolicLink()) {
				options.onSymlinkDetected?.(from);
				const target = resolve(dirname(from), await readlink(from));
				await symlink(await realpath(target), to);
				info = await stat(target);
				if (info.isDirectory()) continue;
			} else if (info.isFile()) {
				await copyFile(from, to);
			} else {
				continue;
			}
			bytes += info.size;
			options.onProgress?.(bytes);
			files.push({
				name,
				src: `${staticBase}/${encodeStaticPath(name)}`,
				sizeInBytes: info.size,
				lastModified: Math.round(info.mtimeMs),
			});
		}
	};
	await mkdir(destination, { recursive: true });
	await walk(source);
	return files;
}
