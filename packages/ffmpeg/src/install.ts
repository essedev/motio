import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { FfmpegError } from "./errors.js";
import {
	DEFAULT_BASE_URL,
	FFMPEG_ARCHIVES,
	FFMPEG_BUILD,
	FFMPEG_VERSION,
	type FfmpegArchive,
	type FfmpegPlatform,
	RELEASE_OWNER,
	REQUIRED_ENCODERS,
} from "./manifest.js";
import { executableNames, ffmpegPlatform } from "./platform.js";
import { readTar, writeEntries } from "./tar.js";

const gunzipAsync = promisify(gunzip);

/** Options of `ensureFfmpeg()` and `findFfmpeg()`. */
export interface EnsureFfmpegOptions {
	/**
	 * Cache folder. Default `$MOTIO_FFMPEG_CACHE`, else `~/.cache/motio/ffmpeg`. Each build lives
	 * in `<cacheDir>/<version>-<build>/<platform>`.
	 */
	cacheDir?: string;
	/**
	 * Base URL the archive is downloaded from (`<baseUrl>/<file>`), for mirrors and tests.
	 * Default `$MOTIO_FFMPEG_BASE_URL`, else the GitHub Release of this build.
	 */
	baseUrl?: string;
	/** Platform to install; default the current one. */
	platform?: FfmpegPlatform;
	/** Called while the archive downloads. */
	onProgress?: (progress: { downloadedBytes: number; totalBytes: number }) => void;
	/** Aborts the download. */
	signal?: AbortSignal;
}

/** An installed pinned FFmpeg. */
export interface InstalledFfmpeg {
	/** Absolute path of `ffmpeg`. */
	ffmpeg: string;
	/** Absolute path of `ffprobe`. */
	ffprobe: string;
	/** FFmpeg release, e.g. `8.1.3`. */
	version: string;
	build: number;
	platform: FfmpegPlatform;
	/** Folder of this build: `bin/`, `licenses/`, `LICENSE.md`, `BUILDINFO.json`. */
	directory: string;
	/** True if this call downloaded it, false if it was already installed. */
	downloaded: boolean;
}

/** What an install is made from; `ensureFfmpeg()` fills it from the manifest. */
export interface InstallSource {
	archive: FfmpegArchive;
	version: string;
	build: number;
	platform: FfmpegPlatform;
	baseUrl: string;
	/** True when `baseUrl` is the manifest's default (the release may not exist yet). */
	defaultBaseUrl: boolean;
}

/** Name of the file written last into a complete install. */
const MARKER = ".motio-ffmpeg.json";

/** Default cache folder. */
export function defaultFfmpegCacheDir(): string {
	return process.env.MOTIO_FFMPEG_CACHE ?? join(homedir(), ".cache", "motio", "ffmpeg");
}

function resolvePlatform(platform: FfmpegPlatform | undefined): FfmpegPlatform {
	const resolved = platform ?? ffmpegPlatform();
	if (!resolved) {
		throw new FfmpegError(
			"E_FFMPEG_UNSUPPORTED_PLATFORM",
			`@motiojs/ffmpeg has no build for ${process.platform} ${process.arch}. Install FFmpeg yourself (5.1 or later) and leave @motiojs/ffmpeg out, or point MOTIO_FFMPEG at an FFmpeg executable.`,
			{ platform: process.platform, arch: process.arch },
		);
	}
	return resolved;
}

function sourceFor(options: EnsureFfmpegOptions): InstallSource {
	const platform = resolvePlatform(options.platform);
	const archive = FFMPEG_ARCHIVES[platform];
	if (!archive) {
		throw new FfmpegError(
			"E_FFMPEG_UNSUPPORTED_PLATFORM",
			`@motiojs/ffmpeg ${FFMPEG_VERSION}-${FFMPEG_BUILD} has no ${platform} archive yet: it is built by the release workflow and added when the release is published. Use the system FFmpeg meanwhile (uninstall @motiojs/ffmpeg or set MOTIO_FFMPEG).`,
			{ platform, version: FFMPEG_VERSION, build: FFMPEG_BUILD },
		);
	}
	const explicit = options.baseUrl ?? process.env.MOTIO_FFMPEG_BASE_URL;
	return {
		archive,
		version: FFMPEG_VERSION,
		build: FFMPEG_BUILD,
		platform,
		baseUrl: (explicit ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
		defaultBaseUrl: explicit === undefined,
	};
}

function installDir(cacheDir: string, source: InstallSource): string {
	return join(cacheDir, `${source.version}-${source.build}`, source.platform);
}

async function readMarker(dir: string): Promise<{ sha256?: unknown } | null> {
	try {
		return JSON.parse(await readFile(join(dir, MARKER), "utf8")) as { sha256?: unknown };
	} catch {
		return null;
	}
}

async function complete(dir: string, source: InstallSource): Promise<boolean> {
	const marker = await readMarker(dir);
	if (marker?.sha256 !== source.archive.sha256) return false;
	const names = executableNames(source.platform);
	try {
		await stat(join(dir, "bin", names.ffmpeg));
		await stat(join(dir, "bin", names.ffprobe));
		return true;
	} catch {
		return false;
	}
}

function installed(dir: string, source: InstallSource, downloaded: boolean): InstalledFfmpeg {
	const names = executableNames(source.platform);
	return {
		ffmpeg: join(dir, "bin", names.ffmpeg),
		ffprobe: join(dir, "bin", names.ffprobe),
		version: source.version,
		build: source.build,
		platform: source.platform,
		directory: dir,
		downloaded,
	};
}

/** Downloads `url` to `file`, hashing on the way; returns the SHA-256 and the size. */
async function download(
	url: string,
	file: string,
	archive: FfmpegArchive,
	options: Pick<EnsureFfmpegOptions, "onProgress" | "signal">,
): Promise<{ sha256: string; size: number }> {
	let response: Response;
	try {
		response = await fetch(url, options.signal ? { signal: options.signal } : {});
	} catch (err) {
		if (options.signal?.aborted) throw options.signal.reason;
		throw new FfmpegError(
			"E_FFMPEG_DOWNLOAD",
			`Could not download ${url}: ${err instanceof Error ? err.message : String(err)}. Check the network, or set MOTIO_FFMPEG_BASE_URL to a mirror.`,
			{ url },
			err,
		);
	}
	if (!response.ok || !response.body) {
		throw new FfmpegError(
			"E_FFMPEG_DOWNLOAD",
			`Downloading ${url} failed with HTTP ${response.status}. Check that the release exists, or set MOTIO_FFMPEG_BASE_URL to a mirror.`,
			{ url, status: response.status },
		);
	}
	const hash = createHash("sha256");
	let size = 0;
	const meter = new Transform({
		transform(chunk: Buffer, _encoding, done) {
			size += chunk.length;
			if (size > archive.size) {
				done(
					new FfmpegError(
						"E_FFMPEG_DIGEST",
						`${url} is larger than the ${archive.size} bytes the manifest pins, so it is not the pinned archive; the download was stopped and discarded.`,
						{ url, expectedSize: archive.size },
					),
				);
				return;
			}
			hash.update(chunk);
			options.onProgress?.({ downloadedBytes: size, totalBytes: archive.size });
			done(null, chunk);
		},
	});
	try {
		await pipeline(
			Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
			meter,
			createWriteStream(file),
			options.signal ? { signal: options.signal } : {},
		);
	} catch (err) {
		if (err instanceof FfmpegError) throw err;
		if (options.signal?.aborted) throw options.signal.reason;
		throw new FfmpegError(
			"E_FFMPEG_DOWNLOAD",
			`The download of ${url} stopped after ${size} of ${archive.size} bytes: ${err instanceof Error ? err.message : String(err)}. Retry.`,
			{ url, downloadedBytes: size },
			err,
		);
	}
	return { sha256: hash.digest("hex"), size };
}

function capture(file: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"] });
		let out = "";
		child.stdout.on("data", (c: Buffer) => {
			out += c.toString();
		});
		child.stderr.on("data", (c: Buffer) => {
			out += c.toString();
		});
		child.on("error", reject);
		child.on("close", (code) =>
			code === 0 ? resolve(out) : reject(new Error(`exited with code ${code}: ${out.slice(-500)}`)),
		);
	});
}

/**
 * Runs the extracted binaries: `ffmpeg -version` must name the pinned release, `-encoders` must
 * list every encoder in `REQUIRED_ENCODERS`, and `ffprobe -version` must run.
 */
export async function verifyBinaries(
	ffmpeg: string,
	ffprobe: string,
	version: string,
): Promise<void> {
	const fail = (message: string, cause?: unknown) =>
		new FfmpegError(
			"E_FFMPEG_VERIFY",
			`The pinned FFmpeg did not pass its check: ${message}. It was not installed; report this with your platform.`,
			{ ffmpeg, ffprobe, version },
			cause,
		);
	let versionText: string;
	let encoders: string;
	try {
		versionText = await capture(ffmpeg, ["-hide_banner", "-version"]);
		encoders = await capture(ffmpeg, ["-hide_banner", "-encoders"]);
		await capture(ffprobe, ["-hide_banner", "-version"]);
	} catch (err) {
		throw fail(`it does not run (${err instanceof Error ? err.message : String(err)})`, err);
	}
	if (!versionText.includes(`ffmpeg version ${version}`)) {
		throw fail(`it reports "${versionText.split("\n")[0] ?? ""}", not FFmpeg ${version}`);
	}
	const body = encoders.split(/^\s*-{6}\s*$/m)[1] ?? "";
	const names = new Set([...body.matchAll(/^\s*[A-Z.]{6}\s+(\S+)/gm)].map((m) => m[1]));
	const missing = REQUIRED_ENCODERS.filter((e) => !names.has(e));
	if (missing.length > 0) throw fail(`it lacks the ${missing.join(", ")} encoder(s)`);
}

/**
 * Downloads, verifies and installs one archive into `<cacheDir>/<version>-<build>/<platform>`.
 * Everything happens in a private temporary folder inside `cacheDir`; the finished folder is
 * moved into place with one rename, so a concurrent call or process either sees a complete
 * install or none, and an interrupted one leaves nothing behind but its temporary folder.
 */
export async function install(
	cacheDir: string,
	source: InstallSource,
	options: Pick<EnsureFfmpegOptions, "onProgress" | "signal"> = {},
): Promise<InstalledFfmpeg> {
	const dir = installDir(cacheDir, source);
	if (await complete(dir, source)) return installed(dir, source, false);
	if (source.defaultBaseUrl && RELEASE_OWNER === "OWNER_PLACEHOLDER") {
		throw new FfmpegError(
			"E_FFMPEG_DOWNLOAD",
			`The FFmpeg ${source.version}-${source.build} archives of this @motiojs/ffmpeg version are not published yet. Set MOTIO_FFMPEG_BASE_URL to a folder or server that holds ${source.archive.file}, or use the system FFmpeg (uninstall @motiojs/ffmpeg or set MOTIO_FFMPEG).`,
			{ file: source.archive.file, platform: source.platform },
		);
	}
	await mkdir(cacheDir, { recursive: true });
	const temp = join(cacheDir, `.install-${process.pid}-${randomBytes(4).toString("hex")}`);
	await mkdir(temp);
	try {
		const url = `${source.baseUrl}/${source.archive.file}`;
		const file = join(temp, source.archive.file);
		const got = await download(url, file, source.archive, options);
		if (got.size !== source.archive.size || got.sha256 !== source.archive.sha256) {
			throw new FfmpegError(
				"E_FFMPEG_DIGEST",
				`${url} does not match the SHA-256 this @motiojs/ffmpeg version pins (got ${got.sha256}, ${got.size} bytes; expected ${source.archive.sha256}, ${source.archive.size} bytes), so it was discarded. Retry; if it persists, the file on the server is not the pinned build.`,
				{ url, expected: source.archive.sha256, actual: got.sha256, size: got.size },
			);
		}
		const root = join(temp, "root");
		try {
			const tar = await gunzipAsync(await readFile(file));
			await writeEntries(root, readTar(tar));
		} catch (err) {
			throw new FfmpegError(
				"E_FFMPEG_VERIFY",
				`Could not unpack ${source.archive.file}: ${err instanceof Error ? err.message : String(err)}.`,
				{ file: source.archive.file },
				err,
			);
		}
		const names = executableNames(source.platform);
		await verifyBinaries(
			join(root, "bin", names.ffmpeg),
			join(root, "bin", names.ffprobe),
			source.version,
		);
		await writeFile(
			join(root, MARKER),
			`${JSON.stringify({ version: source.version, build: source.build, platform: source.platform, sha256: source.archive.sha256, url }, null, "\t")}\n`,
		);
		await mkdir(dirname(dir), { recursive: true });
		try {
			await rename(root, dir);
		} catch (err) {
			// Another process finished first: use its install. A leftover folder without the marker
			// (from a version of this package that did not install atomically, or edited by hand) is
			// moved aside and replaced.
			if (await complete(dir, source)) return installed(dir, source, false);
			const code = (err as NodeJS.ErrnoException).code;
			if (code !== "EEXIST" && code !== "ENOTEMPTY" && code !== "EPERM") throw err;
			await rename(dir, join(temp, "stale"));
			await rename(root, dir);
		}
		return installed(dir, source, true);
	} finally {
		await rm(temp, { recursive: true, force: true });
	}
}

const pending = new Map<string, Promise<InstalledFfmpeg>>();

/**
 * Makes sure the pinned FFmpeg and ffprobe of this package version are installed and returns
 * their paths. On first use it downloads the archive of the current platform, checks its SHA-256
 * against the manifest, unpacks it, runs both binaries and checks their encoders; later calls
 * return the cached install. Safe to call concurrently, in one process or several.
 */
export async function ensureFfmpeg(options: EnsureFfmpegOptions = {}): Promise<InstalledFfmpeg> {
	const cacheDir = options.cacheDir ?? defaultFfmpegCacheDir();
	const source = sourceFor(options);
	const key = installDir(cacheDir, source);
	let p = pending.get(key);
	if (!p) {
		p = install(cacheDir, source, options);
		pending.set(key, p);
		p.then(
			() => pending.delete(key),
			() => pending.delete(key),
		);
	}
	return p;
}

/**
 * The installed pinned FFmpeg, or null when it has not been downloaded yet. Never downloads; for
 * diagnostics such as `motio doctor`.
 */
export async function findFfmpeg(
	options: Pick<EnsureFfmpegOptions, "cacheDir" | "platform"> = {},
): Promise<InstalledFfmpeg | null> {
	const cacheDir = options.cacheDir ?? defaultFfmpegCacheDir();
	const source = sourceFor({ ...options, baseUrl: "unused" });
	const dir = installDir(cacheDir, source);
	return (await complete(dir, source)) ? installed(dir, source, false) : null;
}
