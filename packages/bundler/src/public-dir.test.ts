import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyPublicDir, encodeStaticPath } from "./public-dir.js";

let base: string;
beforeEach(async () => {
	base = await mkdtemp(join(tmpdir(), "motio-public-"));
});
afterEach(() => rm(base, { recursive: true, force: true }));

describe("copyPublicDir", () => {
	it("copies files, forwards symlinks and lists files with encoded URLs", async () => {
		const source = join(base, "public");
		await mkdir(join(source, "nested"), { recursive: true });
		await writeFile(join(source, "nested", "a?b.txt"), "abc");
		await writeFile(join(base, "outside.txt"), "outside!");
		await symlink(join(base, "outside.txt"), join(source, "link.txt"));
		const symlinks: string[] = [];
		const progress: number[] = [];
		const files = await copyPublicDir(source, join(base, "out"), "./public", {
			onSymlinkDetected: (p) => symlinks.push(p),
			onProgress: (b) => progress.push(b),
		});
		expect(files.map(({ name, src, sizeInBytes }) => ({ name, src, sizeInBytes }))).toEqual([
			{ name: "link.txt", src: "./public/link.txt", sizeInBytes: 8 },
			{ name: "nested/a?b.txt", src: "./public/nested/a%3Fb.txt", sizeInBytes: 3 },
		]);
		expect(symlinks).toEqual([join(source, "link.txt")]);
		expect(progress).toEqual([8, 11]);
		expect((await lstat(join(base, "out", "link.txt"))).isSymbolicLink()).toBe(true);
		expect(await readFile(join(base, "out", "nested", "a?b.txt"), "utf8")).toBe("abc");
	});

	it("encodes each segment and drops leading slashes", () => {
		expect(encodeStaticPath("/my image#1.png")).toBe("my%20image%231.png");
		expect(encodeStaticPath("dir/sub/ü.png")).toBe("dir/sub/%C3%BC.png");
	});
});
