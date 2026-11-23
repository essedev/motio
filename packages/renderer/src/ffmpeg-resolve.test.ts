import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	type FfmpegPackage,
	findPackageDir,
	loadFfmpegPackage,
	resolveFfmpeg,
} from "./ffmpeg-resolve.js";

const pinned = {
	ffmpeg: "/cache/bin/ffmpeg",
	ffprobe: "/cache/bin/ffprobe",
	version: "8.1.3",
	build: 1,
};

function fakePackage(installed = true) {
	const calls: string[] = [];
	const pkg: FfmpegPackage = {
		ensureFfmpeg: async () => {
			calls.push("ensure");
			return pinned;
		},
		findFfmpeg: async () => {
			calls.push("find");
			return installed ? pinned : null;
		},
	};
	return { pkg, calls };
}

const deps = (env: Record<string, string>, pkg: FfmpegPackage | null) => ({
	env,
	loadPackage: async () => pkg,
});

describe("resolveFfmpeg (D-065)", () => {
	it("prefers the explicit option, then MOTIO_FFMPEG, then the package, then PATH", async () => {
		const { pkg, calls } = fakePackage();
		const env = { MOTIO_FFMPEG: "/env/ffmpeg" };
		expect(await resolveFfmpeg({ ffmpegExecutable: "/opt/ffmpeg" }, deps(env, pkg))).toEqual({
			ffmpeg: "/opt/ffmpeg",
			ffprobe: "/opt/ffprobe",
			source: "option",
		});
		expect(await resolveFfmpeg({}, deps(env, pkg))).toEqual({
			ffmpeg: "/env/ffmpeg",
			ffprobe: "/env/ffprobe",
			source: "env",
		});
		expect(calls).toEqual([]);
		expect(await resolveFfmpeg({}, deps({}, pkg))).toEqual({
			ffmpeg: pinned.ffmpeg,
			ffprobe: pinned.ffprobe,
			source: "package",
			pinned: { version: "8.1.3", build: 1 },
		});
		expect(calls).toEqual(["ensure"]);
		expect(await resolveFfmpeg({}, deps({}, null))).toEqual({
			ffmpeg: "ffmpeg",
			ffprobe: "ffprobe",
			source: "path",
		});
	});

	it("takes ffprobe from its own option or MOTIO_FFPROBE over the FFmpeg's source", async () => {
		const { pkg } = fakePackage();
		expect(
			(
				await resolveFfmpeg(
					{ ffmpegExecutable: "/opt/ffmpeg", ffprobeExecutable: "/p" },
					deps({}, pkg),
				)
			).ffprobe,
		).toBe("/p");
		expect((await resolveFfmpeg({}, deps({ MOTIO_FFPROBE: "/envprobe" }, pkg))).ffprobe).toBe(
			"/envprobe",
		);
		expect((await resolveFfmpeg({}, deps({ MOTIO_FFPROBE: "/envprobe" }, null))).ffprobe).toBe(
			"/envprobe",
		);
	});

	it("never downloads with download: false, and reports a package not downloaded yet as null", async () => {
		const installed = fakePackage(true);
		expect(await resolveFfmpeg({ download: false }, deps({}, installed.pkg))).toMatchObject({
			source: "package",
		});
		expect(installed.calls).toEqual(["find"]);
		const absent = fakePackage(false);
		expect(await resolveFfmpeg({ download: false }, deps({}, absent.pkg))).toBeNull();
		expect(absent.calls).toEqual(["find"]);
	});

	it("finds @motiojs/ffmpeg only in a node_modules above the start folders, never via NODE_PATH", async () => {
		// Nothing in this workspace depends on it, although `pnpm exec` exposes it through NODE_PATH.
		expect(await loadFfmpegPackage()).toBeNull();
		const project = mkdtempSync(join(tmpdir(), "motio-resolve-"));
		try {
			const pkgDir = join(project, "node_modules", "@motiojs", "ffmpeg");
			mkdirSync(join(pkgDir, "dist"), { recursive: true });
			writeFileSync(
				join(pkgDir, "package.json"),
				JSON.stringify({ type: "module", exports: { ".": { default: "./dist/index.js" } } }),
			);
			writeFileSync(
				join(pkgDir, "dist", "index.js"),
				`export const ensureFfmpeg = async () => (${JSON.stringify(pinned)});\n`,
			);
			const nested = join(project, "src", "deep");
			mkdirSync(nested, { recursive: true });
			expect(findPackageDir(nested)).toBe(pkgDir);
			const loaded = await loadFfmpegPackage([nested]);
			expect(await loaded?.ensureFfmpeg()).toEqual(pinned);
		} finally {
			rmSync(project, { recursive: true, force: true });
		}
	});
});
