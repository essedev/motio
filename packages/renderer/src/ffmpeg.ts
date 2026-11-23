import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { proResProfileNumber, type ResolvedVideoEncoding } from "./codecs.js";
import { MotioError } from "./errors.js";
import type { ColorSpace, PixelFormat, X264Preset } from "./options.js";

/**
 * Oldest FFmpeg the renderer accepts: 5.1, the first release with `-fps_mode`, which frame
 * extraction passes. Every FFmpeg-dependent integration test passes with Debian 12's 5.1 (D-051).
 */
export const MIN_FFMPEG_VERSION: readonly [number, number] = [5, 1];

/** What `probeFfmpeg()` learned about an FFmpeg executable. */
export interface FfmpegInfo {
	path: string;
	/** The version string FFmpeg prints, e.g. `8.1.2` or `N-118000-g1234abcd`. */
	version: string;
	/** Parsed major and minor version, or null for builds from git without a release number. */
	release: [number, number] | null;
	encoders: ReadonlySet<string>;
	decoders: ReadonlySet<string>;
}

/** FFmpeg executable: the `ffmpegExecutable` option, else `$MOTIO_FFMPEG`, else `ffmpeg`. */
export function resolveFfmpegPath(explicit?: string | null): string {
	return explicit ?? process.env.MOTIO_FFMPEG ?? "ffmpeg";
}

/**
 * FFprobe executable: the explicit option, else `$MOTIO_FFPROBE`, else `ffprobe` next to the
 * FFmpeg executable when that is a path, else `ffprobe` on PATH.
 */
export function resolveFfprobePath(explicit: string | null | undefined, ffmpeg: string): string {
	if (explicit) return explicit;
	if (process.env.MOTIO_FFPROBE) return process.env.MOTIO_FFPROBE;
	const m = /^(.*[\\/])ffmpeg(\.exe)?$/i.exec(ffmpeg);
	return m ? `${m[1]}ffprobe${m[2] ?? ""}` : "ffprobe";
}

function capture(cmd: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
		const out: Buffer[] = [];
		child.stdout.on("data", (c: Buffer) => out.push(c));
		child.stderr.on("data", (c: Buffer) => out.push(c));
		child.on("error", reject);
		child.on("close", (code) =>
			code === 0
				? resolve(Buffer.concat(out).toString())
				: reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`)),
		);
	});
}

/** Parses the codec list printed by `ffmpeg -encoders` or `-decoders`. */
export function parseCodecList(text: string): Set<string> {
	const names = new Set<string>();
	let started = false;
	for (const line of text.split("\n")) {
		if (/^\s*-{6}/.test(line)) {
			started = true;
			continue;
		}
		if (!started) continue;
		const m = /^\s*[A-Z.]{6}\s+(\S+)/.exec(line);
		if (m?.[1]) names.add(m[1]);
	}
	return names;
}

/** Parses the first line of `ffmpeg -version`. */
export function parseFfmpegVersion(text: string): {
	version: string;
	release: [number, number] | null;
} {
	const m = /ffmpeg version (\S+)/.exec(text);
	const version = m?.[1] ?? "unknown";
	const r = /^n?(\d+)\.(\d+)/.exec(version);
	return { version, release: r ? [Number(r[1]), Number(r[2])] : null };
}

const cache = new Map<string, Promise<FfmpegInfo>>();

/** Runs `ffmpeg -version`, `-encoders` and `-decoders` once per executable path. */
export function probeFfmpeg(path: string): Promise<FfmpegInfo> {
	let p = cache.get(path);
	if (!p) {
		p = (async () => {
			let versionText: string;
			try {
				versionText = await capture(path, ["-hide_banner", "-version"]);
			} catch (err) {
				throw new MotioError(
					"E_FFMPEG_NOT_FOUND",
					`FFmpeg was not found at "${path}". Install FFmpeg ${MIN_FFMPEG_VERSION.join(".")} or later (for example "brew install ffmpeg" or "apt install ffmpeg"), or set MOTIO_FFMPEG.`,
					{ details: { path } },
					err,
				);
			}
			const [encoders, decoders] = await Promise.all([
				capture(path, ["-hide_banner", "-encoders"]),
				capture(path, ["-hide_banner", "-decoders"]),
			]);
			return {
				path,
				...parseFfmpegVersion(versionText),
				encoders: parseCodecList(encoders),
				decoders: parseCodecList(decoders),
			};
		})();
		cache.set(path, p);
		p.catch(() => cache.delete(path));
	}
	return p;
}

/**
 * What a render needs from FFmpeg. An entry of `encoders` that is a list is satisfied by any one
 * of its encoders (a codec with alternative encoders, such as AV1).
 */
export interface FfmpegNeeds {
	encoders: ReadonlyArray<string | readonly string[]>;
	decoders: readonly string[];
}

/** Throws a clear `E_FFMPEG_*` error unless FFmpeg is recent enough and has the codecs. */
export function assertFfmpegSupports(info: FfmpegInfo, needs: FfmpegNeeds): void {
	const [minMajor, minMinor] = MIN_FFMPEG_VERSION;
	if (info.release) {
		const [major, minor] = info.release;
		if (major < minMajor || (major === minMajor && minor < minMinor)) {
			throw new MotioError(
				"E_FFMPEG_VERSION",
				`FFmpeg ${info.version} at "${info.path}" is too old; Motio needs ${minMajor}.${minMinor} or later. Upgrade FFmpeg or point MOTIO_FFMPEG at a newer build.`,
				{ details: { path: info.path, version: info.version } },
			);
		}
	}
	for (const need of needs.encoders) {
		const choices = typeof need === "string" ? [need] : need;
		if (!choices.some((e) => info.encoders.has(e))) {
			const names = choices.join(" or ");
			throw new MotioError(
				"E_FFMPEG_ENCODER_MISSING",
				`FFmpeg at "${info.path}" has no ${names} encoder. Install a build with ${names}${choices.length > 1 ? "" : " (most distribution packages include it)"}, or install @motiojs/ffmpeg, which has every encoder Motio uses.`,
				{
					details: {
						path: info.path,
						version: info.version,
						encoder: choices[0],
						...(choices.length > 1 ? { alternatives: choices } : {}),
					},
				},
			);
		}
	}
	for (const d of needs.decoders) {
		if (!info.decoders.has(d)) {
			throw new MotioError(
				"E_FFMPEG_ENCODER_MISSING",
				`FFmpeg at "${info.path}" has no ${d} decoder, needed to read captured frames.`,
				{ details: { path: info.path, version: info.version, decoder: d } },
			);
		}
	}
}

/** The first of `encoders` that FFmpeg has (call after `assertFfmpegSupports`). */
export function pickEncoder(info: FfmpegInfo, encoders: readonly [string, ...string[]]): string {
	return encoders.find((e) => info.encoders.has(e)) ?? encoders[0];
}

/** SVT-AV1's library version as FFmpeg's `libsvtav1` reports it. */
export interface SvtAv1Version {
	/** E.g. `4.2.0`; null when the version line was not found. */
	version: string | null;
	major: number | null;
}

/** Parses the `SVT-AV1 Encoder Lib v4.2.0` line SVT-AV1 prints at its default log level. */
export function parseSvtAv1Version(text: string): SvtAv1Version {
	const m = /SVT-AV1 Encoder Lib v(\d+)\.(\d+)\.(\d+)/.exec(text);
	return m
		? { version: `${m[1]}.${m[2]}.${m[3]}`, major: Number(m[1]) }
		: { version: null, major: null };
}

const svtCache = new Map<string, Promise<SvtAv1Version>>();

/**
 * The SVT-AV1 version linked into an FFmpeg: one 64x64 frame encoded to nothing, which makes
 * SVT-AV1 print its version. Cached per executable.
 */
export function probeSvtAv1(ffmpeg: string): Promise<SvtAv1Version> {
	let p = svtCache.get(ffmpeg);
	if (!p) {
		p = new Promise<SvtAv1Version>((resolve) => {
			const child = spawn(
				ffmpeg,
				[
					"-hide_banner",
					"-f",
					"lavfi",
					"-i",
					"color=s=64x64:d=0.04",
					"-frames:v",
					"1",
					"-c:v",
					"libsvtav1",
					"-f",
					"null",
					"-",
				],
				{ stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, SVT_LOG: "3" } },
			);
			let stderr = "";
			child.stderr.on("data", (c: Buffer) => {
				stderr += c.toString();
			});
			child.on("error", () => resolve({ version: null, major: null }));
			child.on("close", () => resolve(parseSvtAv1Version(stderr)));
		});
		svtCache.set(ffmpeg, p);
	}
	return p;
}

/**
 * Oldest SVT-AV1 the renderer prefers to libaom: 3.0 added lossless coding, and 2.3.0 (Debian
 * trixie) replaced whole blocks of a frame-stamp fixture with the colour around them at CRFs from
 * 20 to 50, where 4.2.0 is exact at every CRF and preset tried (D-064).
 */
export const MIN_PREFERRED_SVT_AV1_MAJOR = 3;

/**
 * The encoder of a render (call after `assertFfmpegSupports`). For AV1: SVT-AV1 3.0 or later,
 * else libaom, else an older SVT-AV1, which cannot encode CRF 0 losslessly and fails for it.
 */
export async function chooseVideoEncoder(
	info: FfmpegInfo,
	encoding: ResolvedVideoEncoding,
	probeSvt: (ffmpeg: string) => Promise<SvtAv1Version> = probeSvtAv1,
): Promise<string> {
	if (encoding.codec !== "av1" || !info.encoders.has("libsvtav1")) {
		return pickEncoder(info, encoding.spec.encoders);
	}
	const svt = await probeSvt(info.path);
	// An unparsed version line means a format newer than the ones known: treat it as recent.
	if (svt.major === null || svt.major >= MIN_PREFERRED_SVT_AV1_MAJOR) return "libsvtav1";
	if (info.encoders.has("libaom-av1")) return "libaom-av1";
	if (encoding.crf === 0) {
		throw new MotioError(
			"E_FFMPEG_ENCODER_MISSING",
			`CRF 0 encodes AV1 losslessly, which needs SVT-AV1 ${MIN_PREFERRED_SVT_AV1_MAJOR}.0 or later or libaom; FFmpeg at "${info.path}" has SVT-AV1 ${svt.version} only. Use a CRF of 1 or more, a newer FFmpeg, or @motiojs/ffmpeg.`,
			{ details: { path: info.path, version: info.version, svtAv1: svt.version } },
		);
	}
	return "libsvtav1";
}

/** Colour tags and conversion matrix for a `colorSpace`. */
export interface ColorTags {
	/** `scale` filter matrix name. */
	matrix: string;
	/** `colorspace` filter name of the whole colour space (its `all` option). */
	colorspaceAll: string;
	colorspace: string;
	primaries: string;
	trc: string;
}

/**
 * Maps `colorSpace` to an explicit conversion and tags. `default` resolves to BT.709 as
 * ARCHITECTURE "Colour" prescribes.
 */
export function colorTags(colorSpace: ColorSpace, pixelFormat: PixelFormat): ColorTags {
	switch (colorSpace) {
		case "bt601":
			return {
				matrix: "bt601",
				colorspaceAll: "bt601-6-525",
				colorspace: "smpte170m",
				primaries: "smpte170m",
				trc: "smpte170m",
			};
		case "bt2020-ncl":
			return {
				matrix: "bt2020",
				colorspaceAll: "bt2020",
				colorspace: "bt2020nc",
				primaries: "bt2020",
				trc: pixelFormat.includes("10le") ? "bt2020-10" : "bt709",
			};
		default:
			return {
				matrix: "bt709",
				colorspaceAll: "bt709",
				colorspace: "bt709",
				primaries: "bt709",
				trc: "bt709",
			};
	}
}

/** Formats a frame rate for FFmpeg, as an exact rational where possible. */
export function frameRateArg(fps: number): string {
	if (Number.isInteger(fps)) return String(fps);
	const ntsc = (fps * 1001) / 1000;
	if (Math.abs(ntsc - Math.round(ntsc)) < 1e-6) return `${Math.round(ntsc) * 1000}/1001`;
	return `${Math.round(fps * 1000)}/1000`;
}

/** Settings of one video encode from an image pipe. */
export interface VideoEncodeSettings {
	output: string;
	fps: number;
	imageFormat: "jpeg" | "png";
	encoding: ResolvedVideoEncoding;
	preset: X264Preset;
	colorSpace: ColorSpace;
	frameCount: number;
	/** Muxer instead of the codec's own, for chunks (D-018). */
	muxer?: string;
	/** The encoder `pickEncoder` chose; default the codec's first encoder. */
	encoder?: string;
}

const SWS = "flags=accurate_rnd+full_chroma_int";

/**
 * VP8 runs in constrained quality: libvpx's VP8 encoder ignores the CRF without a target
 * bitrate (D-037), so a cap far above any real frame lets the CRF decide.
 */
export const VP8_BITRATE_CAP = "1000M";

/**
 * The video filter converting captured frames to YUV, never left to FFmpeg's defaults. PNG
 * decodes to full-range RGB(A), converted to the output matrix and limited range. JPEG from
 * Chrome decodes to full-range BT.601 YCbCr (JFIF) with 4:2:0 chroma: the `colorspace` filter
 * converts its matrix and range in YUV, keeping the chroma samples Chrome encoded instead of
 * resampling them through RGB (D-040). It runs on 8-bit planar YUV marked full range first,
 * because FFmpeg versions disagree on whether converting the decoder's `yuvj` formats also
 * compresses the range. Only the matrix and range change (`fast`): the pixels are sRGB, so
 * primaries and transfer stay as they are and are only tagged.
 */
export function colorFilter(settings: {
	imageFormat: "jpeg" | "png";
	pixelFormat: PixelFormat;
	colorSpace: ColorSpace;
}): string {
	const tags = colorTags(settings.colorSpace, settings.pixelFormat);
	// setparams tags the frames themselves: FFmpeg 7 and later take the encoder's colour
	// metadata from the frames and ignore -color_primaries and -color_trc otherwise.
	const tag = `setparams=colorspace=${tags.colorspace}:color_primaries=${tags.primaries}:color_trc=${tags.trc}:range=tv`;
	if (settings.imageFormat === "png") {
		return `scale=in_range=pc:out_color_matrix=${tags.matrix}:out_range=tv:${SWS},format=${settings.pixelFormat},${tag}`;
	}
	return `scale=in_range=pc:out_range=pc,format=yuv420p|yuv422p|yuv444p,colorspace=all=${tags.colorspaceAll}:iall=bt601-6-625:irange=pc:range=tv:fast=1,format=${settings.pixelFormat},${tag}`;
}

/** The filter converting captured frames to the RGB(A) a GIF palette is built from. */
export function gifRgbFilter(imageFormat: "jpeg" | "png"): string {
	return imageFormat === "png"
		? "format=rgba"
		: `scale=in_color_matrix=bt601:in_range=pc:${SWS},format=rgb24`;
}

/**
 * Arguments reading the image pipe on stdin. The probe is cut to the minimum: by default FFmpeg
 * reads up to 5 MB of input to find the stream parameters before it decodes anything, which on a
 * short or small-framed render means encoding starts only when stdin closes, after the last
 * capture (D-040). The codec and frame rate are given, and the size comes from the first image.
 */
export function pipeInput(fps: number, imageFormat: "jpeg" | "png"): string[] {
	return [
		"-hide_banner",
		"-loglevel",
		"error",
		"-progress",
		"pipe:1",
		"-nostats",
		"-probesize",
		"32",
		"-analyzeduration",
		"0",
		"-f",
		"image2pipe",
		"-framerate",
		frameRateArg(fps),
		"-c:v",
		imageFormat === "png" ? "png" : "mjpeg",
		"-i",
		"pipe:0",
	];
}

/**
 * libaom's speed setting for AV1 (`-cpu-used`): its default (1) encodes a 1080p frame in seconds;
 * 6 with row multithreading keeps a fallback render usable (D-064).
 */
export const LIBAOM_CPU_USED = "6";

/**
 * Encoder arguments of a YUV codec (everything but GIF). `encoder` selects between alternative
 * encoders of a codec (AV1); default the codec's first.
 */
export function codecArgs(
	encoding: ResolvedVideoEncoding,
	preset: X264Preset,
	encoder: string = encoding.spec.encoders[0],
): string[] {
	const crf = String(encoding.crf);
	switch (encoding.codec) {
		case "h264":
		case "h264-mkv":
		case "h264-ts":
			return ["-c:v", "libx264", "-preset", preset, "-crf", crf];
		case "h265":
			return ["-c:v", "libx265", "-crf", crf, "-x265-params", "log-level=error"];
		case "vp8":
			return [
				"-c:v",
				"libvpx",
				"-crf",
				crf,
				"-b:v",
				VP8_BITRATE_CAP,
				...(encoding.alpha ? ["-auto-alt-ref", "0"] : []),
			];
		case "vp9":
			return [
				"-c:v",
				"libvpx-vp9",
				// D-037: CRF 0, the best quality, encodes losslessly.
				...(encoding.crf === 0 ? ["-lossless", "1"] : ["-crf", crf]),
				"-b:v",
				"0",
				// Required for VP9 alpha (D-019).
				...(encoding.alpha ? ["-auto-alt-ref", "0"] : []),
			];
		case "av1":
			// D-064: CRF 0, the best quality, encodes losslessly, as for VP9. libaom's CRF 0 is
			// lossless (its -lossless option, in FFmpeg 7.1, was not); SVT-AV1 reads a CRF of 0 as
			// "not set" and would fall back to its own default.
			if (encoder === "libaom-av1") {
				return [
					"-c:v",
					"libaom-av1",
					"-crf",
					crf,
					"-b:v",
					"0",
					"-cpu-used",
					LIBAOM_CPU_USED,
					"-row-mt",
					"1",
				];
			}
			return [
				"-c:v",
				"libsvtav1",
				...(encoding.crf === 0 ? ["-svtav1-params", "lossless=1"] : ["-crf", crf]),
			];
		case "prores":
			return [
				"-c:v",
				"prores_ks",
				"-profile:v",
				String(proResProfileNumber(encoding.proResProfile ?? "hq")),
				"-vendor",
				"apl0",
				...(encoding.proResBitsPerMacroblock === null
					? []
					: ["-bits_per_mb", String(encoding.proResBitsPerMacroblock)]),
			];
		case "gif":
			throw new Error("GIF is encoded by gifPaletteArgs");
	}
}

/**
 * FFmpeg arguments encoding the image pipe on stdin to a video file. For GIF this is the first
 * of three passes: the captured images are copied to an intermediate file (`settings.output`),
 * from which `gifPaletteArgs` and `gifEncodeArgs` build the palette and the GIF (D-020), so the
 * palette sees every frame without holding them all in memory.
 */
export function videoArgs(s: VideoEncodeSettings): string[] {
	const input = pipeInput(s.fps, s.imageFormat);
	const frames = ["-frames:v", String(s.frameCount), "-an"];
	if (s.encoding.codec === "gif") {
		return [...input, "-c:v", "copy", ...frames, "-f", "nut", "-y", s.output];
	}
	const pixelFormat = s.encoding.pixelFormat as PixelFormat;
	const tags = colorTags(s.colorSpace, pixelFormat);
	const muxer = s.muxer ?? s.encoding.spec.muxer;
	return [
		...input,
		"-vf",
		colorFilter({ imageFormat: s.imageFormat, pixelFormat, colorSpace: s.colorSpace }),
		...codecArgs(s.encoding, s.preset, s.encoder),
		"-pix_fmt",
		pixelFormat,
		"-colorspace",
		tags.colorspace,
		"-color_primaries",
		tags.primaries,
		"-color_trc",
		tags.trc,
		"-color_range",
		"tv",
		"-r",
		frameRateArg(s.fps),
		...frames,
		...(s.encoding.codec === "h265" && (muxer === "mp4" || muxer === "mov")
			? ["-tag:v", "hvc1"]
			: []),
		...(muxer === "mp4" || muxer === "mov" ? ["-movflags", "+faststart"] : []),
		"-f",
		muxer,
		"-y",
		s.output,
	];
}

/** Second GIF pass: the palette of the whole clip (D-020). */
export function gifPaletteArgs(
	intermediate: string,
	imageFormat: "jpeg" | "png",
	palette: string,
): string[] {
	return [
		"-hide_banner",
		"-loglevel",
		"error",
		"-i",
		intermediate,
		"-vf",
		`${gifRgbFilter(imageFormat)},palettegen=max_colors=256:stats_mode=full`,
		"-frames:v",
		"1",
		"-update",
		"1",
		"-y",
		palette,
	];
}

/** Third GIF pass: map every frame to the palette, without dithering (D-020). */
export function gifEncodeArgs(options: {
	intermediate: string;
	palette: string;
	imageFormat: "jpeg" | "png";
	fps: number;
	loop: number;
	output: string;
}): string[] {
	return [
		"-hide_banner",
		"-loglevel",
		"error",
		"-i",
		options.intermediate,
		"-i",
		options.palette,
		"-lavfi",
		`[0:v]${gifRgbFilter(options.imageFormat)}[x];[x][1:v]paletteuse=dither=none`,
		"-r",
		frameRateArg(options.fps),
		"-loop",
		String(options.loop),
		"-f",
		"gif",
		"-y",
		options.output,
	];
}

/**
 * Runs FFmpeg to completion; throws `E_FFMPEG_FAILED` with its stderr. Aborting `signal` kills
 * FFmpeg and rejects with the signal's reason.
 */
export function runFfmpeg(ffmpeg: string, args: string[], signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason);
			return;
		}
		const child = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
		const onAbort = () => {
			child.kill("SIGKILL");
			reject(signal?.reason);
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		child.on("close", () => signal?.removeEventListener("abort", onAbort));
		let stderr = "";
		child.stderr.on("data", (c: Buffer) => {
			stderr = (stderr + c.toString()).slice(-8_000);
		});
		child.on("error", (err) =>
			reject(new MotioError("E_FFMPEG_FAILED", `FFmpeg could not be started: ${err.message}`)),
		);
		child.on("close", (code) =>
			code === 0
				? resolve()
				: reject(
						new MotioError(
							"E_FFMPEG_FAILED",
							`FFmpeg exited with code ${code}${stderr.trim() ? `: ${stderr.trim()}` : "."}`,
							{ details: { stderr, args: args.join(" ") } },
						),
					),
		);
	});
}

/**
 * Environment of an encode. SVT-AV1 prints its configuration to stderr at its default log level,
 * which would bury FFmpeg's own error in a failure message; warnings and errors still show.
 */
function encoderEnv(): NodeJS.ProcessEnv {
	return { ...process.env, SVT_LOG: process.env.SVT_LOG ?? "2" };
}

/** A running FFmpeg encode fed through stdin. */
export class Encoder {
	private stderr = "";
	private failure: MotioError | undefined;
	private readonly exited: Promise<number | null>;
	private encoded = 0;

	private constructor(
		private readonly child: ChildProcessWithoutNullStreams,
		private readonly onEncoded: (frames: number) => void,
	) {
		child.stderr.on("data", (c: Buffer) => {
			this.stderr = (this.stderr + c.toString()).slice(-8_000);
		});
		let progress = "";
		child.stdout.on("data", (c: Buffer) => {
			progress += c.toString();
			const lines = progress.split("\n");
			progress = lines.pop() ?? "";
			for (const line of lines) {
				const m = /^frame=(\d+)/.exec(line);
				if (m) {
					const n = Number(m[1]);
					if (n > this.encoded) {
						this.encoded = n;
						this.onEncoded(n);
					}
				}
			}
		});
		child.stdin.on("error", (err) => {
			this.failure ??= this.ffmpegError("FFmpeg stopped reading frames", err);
		});
		this.exited = new Promise((resolve) => {
			child.on("error", (err) => {
				this.failure ??= this.ffmpegError("FFmpeg could not be started", err);
				resolve(null);
			});
			child.on("close", (code) => resolve(code));
		});
	}

	/** Starts FFmpeg with `args`. */
	static start(
		ffmpeg: string,
		args: string[],
		onEncoded: (frames: number) => void = () => {},
	): Encoder {
		const child = spawn(ffmpeg, args, { stdio: ["pipe", "pipe", "pipe"], env: encoderEnv() });
		return new Encoder(child, onEncoded);
	}

	/** Process id, for diagnostics. */
	get pid(): number | undefined {
		return this.child.pid;
	}

	/** Frames FFmpeg reported as encoded. */
	get encodedFrames(): number {
		return this.encoded;
	}

	private ffmpegError(what: string, cause?: unknown): MotioError {
		return new MotioError(
			"E_FFMPEG_FAILED",
			`${what}${this.stderr.trim() ? `: ${this.stderr.trim()}` : "."}`,
			{ details: { stderr: this.stderr } },
			cause,
		);
	}

	/** Writes one encoded image, waiting for the pipe to drain (backpressure). */
	async write(image: Uint8Array): Promise<void> {
		if (this.failure) throw this.failure;
		if (this.child.exitCode !== null)
			throw this.ffmpegError("FFmpeg exited before all frames were written");
		const ok = this.child.stdin.write(image);
		if (!ok) {
			await new Promise<void>((resolve, reject) => {
				const onDrain = () => {
					cleanup();
					resolve();
				};
				const onClose = () => {
					cleanup();
					reject(this.failure ?? this.ffmpegError("FFmpeg exited before all frames were written"));
				};
				const cleanup = () => {
					this.child.stdin.off("drain", onDrain);
					this.child.off("close", onClose);
				};
				this.child.stdin.once("drain", onDrain);
				this.child.once("close", onClose);
			});
		}
		if (this.failure) throw this.failure;
	}

	/** Closes stdin and waits for FFmpeg to finish; throws `E_FFMPEG_FAILED` on a non-zero exit. */
	async finish(): Promise<void> {
		this.child.stdin.end();
		const code = await this.exited;
		if (this.failure) throw this.failure;
		if (code !== 0) throw this.ffmpegError(`FFmpeg exited with code ${code}`);
	}

	/** Kills FFmpeg and waits for it to exit. */
	async kill(): Promise<void> {
		if (this.child.exitCode === null && this.child.signalCode === null) {
			this.child.stdin.destroy();
			this.child.kill("SIGKILL");
		}
		await this.exited;
	}
}
