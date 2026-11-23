import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";

/** One regular file or directory of a tar archive. */
export interface TarEntry {
	/** Path inside the archive, with the first component (the archive's root folder) removed. */
	path: string;
	type: "file" | "directory";
	mode: number;
	data: Uint8Array;
}

const BLOCK = 512;

function text(block: Uint8Array, start: number, length: number): string {
	const slice = block.subarray(start, start + length);
	const end = slice.indexOf(0);
	return new TextDecoder().decode(end === -1 ? slice : slice.subarray(0, end));
}

function octal(block: Uint8Array, start: number, length: number): number {
	const first = block[start] ?? 0;
	if (first & 0x80) {
		// Base-256 (GNU) for sizes of 8 GiB and more: never in these archives.
		throw new Error("tar: base-256 numbers are not supported");
	}
	const value = text(block, start, length).trim();
	return value === "" ? 0 : Number.parseInt(value, 8);
}

/** Records of a pax extended header (`<length> <key>=<value>\n`). */
function paxRecords(data: Uint8Array): Map<string, string> {
	const records = new Map<string, string>();
	const body = new TextDecoder().decode(data);
	let i = 0;
	while (i < body.length) {
		const space = body.indexOf(" ", i);
		if (space === -1) break;
		const length = Number(body.slice(i, space));
		if (!Number.isInteger(length) || length <= 0) break;
		const record = body.slice(space + 1, i + length - 1);
		const eq = record.indexOf("=");
		if (eq !== -1) records.set(record.slice(0, eq), record.slice(eq + 1));
		i += length;
	}
	return records;
}

/** Removes the archive's root folder and refuses paths that would leave the target folder. */
function stripRoot(path: string): string | null {
	const parts = path.split("/").filter((p) => p !== "" && p !== ".");
	if (parts.length <= 1) return null;
	const rest = parts.slice(1);
	if (rest.some((p) => p === "..") || path.startsWith("/")) {
		throw new Error(`tar: unsafe path ${JSON.stringify(path)}`);
	}
	return rest.join("/");
}

/**
 * Reads an uncompressed tar archive (ustar, with pax and GNU long-name headers). Only regular
 * files and directories are accepted: any other entry type (links, devices) is an error, because
 * the release archives contain none.
 */
export function readTar(archive: Uint8Array): TarEntry[] {
	const entries: TarEntry[] = [];
	let offset = 0;
	let longName: string | null = null;
	let paxPath: string | null = null;
	while (offset + BLOCK <= archive.length) {
		const header = archive.subarray(offset, offset + BLOCK);
		if (header.every((b) => b === 0)) break;
		const size = octal(header, 124, 12);
		const type = String.fromCharCode(header[156] ?? 0);
		const data = archive.subarray(offset + BLOCK, offset + BLOCK + size);
		if (data.length !== size) throw new Error("tar: truncated archive");
		offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
		if (type === "x") {
			paxPath = paxRecords(data).get("path") ?? null;
			continue;
		}
		if (type === "g") continue;
		if (type === "L") {
			longName = text(data, 0, data.length);
			continue;
		}
		const prefix = text(header, 345, 155);
		const name =
			paxPath ?? longName ?? (prefix ? `${prefix}/${text(header, 0, 100)}` : text(header, 0, 100));
		paxPath = null;
		longName = null;
		if (type !== "0" && type !== "\0" && type !== "5") {
			throw new Error(
				`tar: entry ${JSON.stringify(name)} has unsupported type ${JSON.stringify(type)}`,
			);
		}
		const path = stripRoot(name);
		if (path === null) continue;
		entries.push({
			path,
			type: type === "5" ? "directory" : "file",
			mode: octal(header, 100, 8) & 0o777,
			data,
		});
	}
	return entries;
}

/** Writes tar entries under `dir`, keeping the executable bits. */
export async function writeEntries(dir: string, entries: readonly TarEntry[]): Promise<void> {
	for (const entry of entries) {
		const target = join(dir, normalize(entry.path));
		if (!target.startsWith(dir + sep)) throw new Error(`tar: unsafe path ${entry.path}`);
		if (entry.type === "directory") {
			await mkdir(target, { recursive: true });
			continue;
		}
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, entry.data);
		await chmod(target, entry.mode & 0o111 ? 0o755 : 0o644);
	}
}
