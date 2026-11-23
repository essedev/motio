import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ensureFfmpeg, findFfmpeg, type InstallSource, install } from "./install.js";
import { FFMPEG_ARCHIVES, FFMPEG_BUILD, FFMPEG_VERSION } from "./manifest.js";
import { ffmpegPlatform } from "./platform.js";
import { fakeReleaseArchive, serveFiles } from "./test-support/archives.js";

const good = fakeReleaseArchive();
const noAv1 = fakeReleaseArchive({ missingEncoders: ["libsvtav1"] });
const wrongVersion = fakeReleaseArchive({ version: "7.0" });
/** The same bytes with one flipped in the middle: same size, different digest. */
function tamper(bytes: Buffer): Buffer {
	const copy = Buffer.from(bytes);
	const at = Math.floor(copy.length / 2);
	copy[at] = (copy[at] ?? 0) ^ 0xff;
	return copy;
}
let server: Awaited<ReturnType<typeof serveFiles>>;
let root: string;

beforeAll(async () => {
	server = await serveFiles({
		"good.tar.gz": good.bytes,
		"no-av1.tar.gz": noAv1.bytes,
		"wrong-version.tar.gz": wrongVersion.bytes,
		"tampered.tar.gz": tamper(good.bytes),
		"too-big.tar.gz": Buffer.concat([good.bytes, Buffer.alloc(4096)]),
	});
	root = mkdtempSync(join(tmpdir(), "motio-ffmpeg-"));
});
afterAll(async () => {
	await server.close();
	rmSync(root, { recursive: true, force: true });
});
afterEach(() => {
	server.requests.length = 0;
});

let n = 0;
function cache(): string {
	n += 1;
	return join(root, `cache-${n}`);
}

function source(file: string, archive = good.archive, over: Partial<InstallSource> = {}) {
	return {
		archive: { ...archive, file },
		version: FFMPEG_VERSION,
		build: FFMPEG_BUILD,
		platform: "linux-x64" as const,
		baseUrl: server.url,
		defaultBaseUrl: false,
		...over,
	};
}

async function rejection(p: Promise<unknown>): Promise<Error & { code?: string }> {
	try {
		await p;
	} catch (e) {
		return e as Error & { code?: string };
	}
	throw new Error("expected a rejection");
}

describe("install", () => {
	it("downloads, verifies and installs into <cache>/<version>-<build>/<platform>", async () => {
		const dir = cache();
		const progress: number[] = [];
		const result = await install(dir, source("good.tar.gz"), {
			onProgress: (p) => progress.push(p.downloadedBytes),
		});
		expect(result).toMatchObject({
			version: FFMPEG_VERSION,
			build: FFMPEG_BUILD,
			platform: "linux-x64",
			downloaded: true,
			directory: join(dir, `${FFMPEG_VERSION}-${FFMPEG_BUILD}`, "linux-x64"),
		});
		expect(execFileSync(result.ffmpeg, ["-version"]).toString()).toContain(FFMPEG_VERSION);
		expect(execFileSync(result.ffprobe).toString()).toContain("ffprobe version");
		expect(readFileSync(join(result.directory, "LICENSE.md"), "utf8")).toContain("GPL");
		expect(progress.at(-1)).toBe(good.archive.size);
		// Only the install folder is left in the cache: no temporary folders.
		expect(readdirSync(dir)).toEqual([`${FFMPEG_VERSION}-${FFMPEG_BUILD}`]);

		const again = await install(dir, source("good.tar.gz"));
		expect(again).toMatchObject({ downloaded: false, ffmpeg: result.ffmpeg });
		expect(server.requests).toEqual(["good.tar.gz"]);
	});

	it("is safe when several installs race, as separate processes would", async () => {
		const dir = cache();
		const results = await Promise.all(
			Array.from({ length: 4 }, () => install(dir, source("good.tar.gz"))),
		);
		expect(new Set(results.map((r) => r.ffmpeg)).size).toBe(1);
		expect(results.filter((r) => r.downloaded).length).toBeGreaterThanOrEqual(1);
		expect(readdirSync(dir)).toEqual([`${FFMPEG_VERSION}-${FFMPEG_BUILD}`]);
		expect(execFileSync(results[0]?.ffmpeg ?? "", ["-version"]).toString()).toContain(
			FFMPEG_VERSION,
		);
	});

	it("replaces a leftover folder that has no completion marker", async () => {
		const dir = cache();
		const target = join(dir, `${FFMPEG_VERSION}-${FFMPEG_BUILD}`, "linux-x64");
		mkdirSync(join(target, "bin"), { recursive: true });
		writeFileSync(join(target, "bin", "ffmpeg"), "broken");
		const result = await install(dir, source("good.tar.gz"));
		expect(result.downloaded).toBe(true);
		expect(execFileSync(result.ffmpeg, ["-version"]).toString()).toContain(FFMPEG_VERSION);
	});

	it("rejects an archive whose digest or size differs, and installs nothing", async () => {
		const dir = cache();
		const tampered = await rejection(install(dir, source("tampered.tar.gz")));
		expect(tampered.code).toBe("E_FFMPEG_DIGEST");
		expect(tampered.message).toContain(good.archive.sha256);
		const big = await rejection(install(dir, source("too-big.tar.gz")));
		expect(big.code).toBe("E_FFMPEG_DIGEST");
		expect(readdirSync(dir)).toEqual([]);
	});

	it("reports HTTP errors and unreachable servers as E_FFMPEG_DOWNLOAD", async () => {
		const missing = await rejection(install(cache(), source("absent.tar.gz")));
		expect(missing).toMatchObject({ code: "E_FFMPEG_DOWNLOAD", details: { status: 404 } });
		const refused = await rejection(
			install(cache(), source("good.tar.gz", good.archive, { baseUrl: "http://127.0.0.1:9" })),
		);
		expect(refused.code).toBe("E_FFMPEG_DOWNLOAD");
	});

	it("runs the binaries before installing: wrong version or a missing encoder fails", async () => {
		const dir = cache();
		const encoder = await rejection(install(dir, source("no-av1.tar.gz", noAv1.archive)));
		expect(encoder.code).toBe("E_FFMPEG_VERIFY");
		expect(encoder.message).toContain("libsvtav1");
		const version = await rejection(
			install(dir, source("wrong-version.tar.gz", wrongVersion.archive)),
		);
		expect(version.code).toBe("E_FFMPEG_VERIFY");
		expect(version.message).toContain(`not FFmpeg ${FFMPEG_VERSION}`);
		expect(readdirSync(dir)).toEqual([]);
	});

	it("stops when the signal aborts", async () => {
		const controller = new AbortController();
		controller.abort(new Error("stop"));
		const err = await rejection(
			install(cache(), source("good.tar.gz"), { signal: controller.signal }),
		);
		expect(err.message).toBe("stop");
	});

	it("refuses to download from the placeholder release before it is published", async () => {
		const err = await rejection(
			install(cache(), source("good.tar.gz", good.archive, { defaultBaseUrl: true })),
		);
		expect(err.code).toBe("E_FFMPEG_DOWNLOAD");
		expect(err.message).toContain("MOTIO_FFMPEG_BASE_URL");
		expect(server.requests).toEqual([]);
	});
});

describe("ensureFfmpeg and findFfmpeg", () => {
	it("name platforms without an archive, without touching the network", async () => {
		const missing = Object.entries(FFMPEG_ARCHIVES).find(([, a]) => a === null)?.[0];
		expect(missing).toBeDefined();
		const err = await rejection(
			ensureFfmpeg({
				cacheDir: cache(),
				baseUrl: server.url,
				platform: missing as "win32-x64",
			}),
		);
		expect(err.code).toBe("E_FFMPEG_UNSUPPORTED_PLATFORM");
		expect(server.requests).toEqual([]);
	});

	it("find nothing before an install and never download", async () => {
		const platform = ffmpegPlatform();
		if (!platform || !FFMPEG_ARCHIVES[platform]) return;
		expect(await findFfmpeg({ cacheDir: cache() })).toBeNull();
		expect(server.requests).toEqual([]);
	});

	it("download through MOTIO_FFMPEG_BASE_URL and report a digest mismatch", async () => {
		const platform = ffmpegPlatform();
		const archive = platform ? FFMPEG_ARCHIVES[platform] : null;
		if (!archive) return;
		// The fake archive is served under the real file name: the pinned digest rejects it.
		const mirror = await serveFiles({ [archive.file]: good.bytes });
		const previous = process.env.MOTIO_FFMPEG_BASE_URL;
		process.env.MOTIO_FFMPEG_BASE_URL = mirror.url;
		try {
			const err = await rejection(ensureFfmpeg({ cacheDir: cache() }));
			expect(err.code).toBe("E_FFMPEG_DIGEST");
			expect(mirror.requests).toEqual([archive.file]);
		} finally {
			if (previous === undefined) delete process.env.MOTIO_FFMPEG_BASE_URL;
			else process.env.MOTIO_FFMPEG_BASE_URL = previous;
			await mirror.close();
		}
	});
});
