import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { encodeStaticPath, STATIC_FILES_LIMIT, type StaticFile } from "./public-dir.js";

/**
 * Lists the files of a public directory without copying it, as the dev server serves it in
 * place. Symlinks are followed; entries that vanish while listing are skipped. At most
 * `STATIC_FILES_LIMIT` files are returned, as `getStaticFiles()` does.
 */
export async function listStaticFiles(
	directory: string,
	staticBase: string,
): Promise<StaticFile[]> {
	const base = staticBase.endsWith("/") ? staticBase : `${staticBase}/`;
	const files: StaticFile[] = [];
	const walk = async (relativeDir: string): Promise<void> => {
		const entries = await readdir(join(directory, relativeDir), { withFileTypes: true });
		entries.sort((a, b) => a.name.localeCompare(b.name));
		for (const entry of entries) {
			if (files.length >= STATIC_FILES_LIMIT) return;
			const name = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
			let info: Awaited<ReturnType<typeof stat>>;
			try {
				info = await stat(join(directory, name));
			} catch (error) {
				// Deleted between readdir and stat, or a dangling symlink.
				if ((error as { code?: string }).code === "ENOENT") continue;
				throw error;
			}
			if (info.isDirectory()) {
				await walk(name);
			} else if (info.isFile()) {
				files.push({
					name,
					src: `${base}${encodeStaticPath(name)}`,
					sizeInBytes: info.size,
					lastModified: Math.round(info.mtimeMs),
				});
			}
		}
	};
	await walk("");
	return files;
}
