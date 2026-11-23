import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readTar, writeEntries } from "./tar.js";
import { tarBytes } from "./test-support/archives.js";

const read = (entries: Parameters<typeof tarBytes>[0]) => readTar(tarBytes(entries));

describe("readTar", () => {
	it("returns files and folders without the root folder, with their modes", () => {
		const entries = read([
			{ name: "root/" },
			{ name: "root/bin/", type: "5" },
			{ name: "root/bin/ffmpeg", data: "x", mode: 0o755 },
			{ name: "root/LICENSE.md", data: "text" },
		]);
		expect(entries.map((e) => [e.path, e.type, e.mode])).toEqual([
			["bin", "directory", 0o644],
			["bin/ffmpeg", "file", 0o755],
			["LICENSE.md", "file", 0o644],
		]);
		expect(new TextDecoder().decode(entries[2]?.data)).toBe("text");
	});

	it("takes long names from pax and GNU headers", () => {
		const long = `root/licenses/${"a".repeat(120)}`;
		expect(read([{ name: "ignored", pax: long, data: "1" }])[0]?.path).toBe(
			`licenses/${"a".repeat(120)}`,
		);
		expect(read([{ name: long, longName: true, data: "1" }])[0]?.path).toBe(
			`licenses/${"a".repeat(120)}`,
		);
	});

	it("refuses links, paths that leave the folder and truncated archives", () => {
		expect(() => read([{ name: "root/link", type: "2" }])).toThrow(/unsupported type/);
		expect(() => read([{ name: "root/../../etc/passwd", data: "x" }])).toThrow(/unsafe path/);
		const bytes = tarBytes([{ name: "root/file", data: "x".repeat(2000) }]);
		expect(() => readTar(bytes.subarray(0, 1024))).toThrow(/truncated/);
	});

	it("reads what the system tar writes, as package.sh does", () => {
		const dir = mkdtempSync(join(tmpdir(), "motio-tar-"));
		try {
			mkdirSync(join(dir, "pkg", "bin"), { recursive: true });
			writeFileSync(join(dir, "pkg", "bin", "ffmpeg"), "#!/bin/sh\n", { mode: 0o755 });
			writeFileSync(join(dir, "pkg", `${"n".repeat(130)}.md`), "long");
			execFileSync("tar", ["-cf", join(dir, "a.tar"), "-C", dir, "pkg"], {
				env: { ...process.env, COPYFILE_DISABLE: "1" },
			});
			const entries = readTar(readFileSync(join(dir, "a.tar")));
			const files = entries.filter((e) => e.type === "file").map((e) => e.path);
			expect(files.sort()).toEqual(["bin/ffmpeg", `${"n".repeat(130)}.md`]);
			expect(entries.find((e) => e.path === "bin/ffmpeg")?.mode).toBe(0o755);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("writeEntries", () => {
	it("writes files with the executable bit and folders", async () => {
		const dir = mkdtempSync(join(tmpdir(), "motio-tar-"));
		try {
			await writeEntries(
				dir,
				read([
					{ name: "r/bin/ffmpeg", data: "x", mode: 0o750 },
					{ name: "r/a", data: "y" },
				]),
			);
			expect(statSync(join(dir, "bin", "ffmpeg")).mode & 0o777).toBe(0o755);
			expect(statSync(join(dir, "a")).mode & 0o777).toBe(0o644);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
