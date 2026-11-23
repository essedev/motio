import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { MotioError } from "./errors.js";
import type { ColorSpace, PixelFormat, X264Preset } from "./options.js";

/** Oldest FFmpeg the renderer accepts. */
export const MIN_FFMPEG_VERSION: readonly [number, number] = [4, 4];

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

/** Throws a clear `E_FFMPEG_*` error unless FFmpeg is recent enough and has the codecs. */
export function assertFfmpegSupports(
	info: FfmpegInfo,
	needs: { encoders: string[]; decoders: string[] },
): void {
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
	for (const e of needs.encoders) {
		if (!info.encoders.has(e)) {
			throw new MotioError(
				"E_FFMPEG_ENCODER_MISSING",
				`FFmpeg at "${info.path}" has no ${e} encoder. Install a build with ${e} (most distribution packages include it).`,
				{ details: { path: info.path, version: info.version, encoder: e } },
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

/** Colour tags and conversion matrix for a `colorSpace`. */
export interface ColorTags {
	/** `scale` filter matrix name. */
	matrix: string;
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
			return { matrix: "bt601", colorspace: "smpte170m", primaries: "smpte170m", trc: "smpte170m" };
		case "bt2020-ncl":
			return {
				matrix: "bt2020",
				colorspace: "bt2020nc",
				primaries: "bt2020",
				trc: pixelFormat.includes("10le") ? "bt2020-10" : "bt709",
			};
		default:
			return { matrix: "bt709", colorspace: "bt709", primaries: "bt709", trc: "bt709" };
	}
}

/** Formats a frame rate for FFmpeg, as an exact rational where possible. */
export function frameRateArg(fps: number): string {
	if (Number.isInteger(fps)) return String(fps);
	const ntsc = (fps * 1001) / 1000;
	if (Math.abs(ntsc - Math.round(ntsc)) < 1e-6) return `${Math.round(ntsc) * 1000}/1001`;
	return `${Math.round(fps * 1000)}/1000`;
}

/** Settings of one H.264 encode. */
export interface H264EncodeSettings {
	output: string;
	fps: number;
	imageFormat: "jpeg" | "png";
	crf: number;
	preset: X264Preset;
	pixelFormat: PixelFormat;
	colorSpace: ColorSpace;
	frameCount: number;
}

const SWS = "flags=accurate_rnd+full_chroma_int";

/**
 * The video filter converting captured frames to YUV. PNG decodes to full-range RGB(A); JPEG
 * from Chrome decodes to full-range BT.601 YCbCr (JFIF), so it is first converted to RGB with
 * that matrix and range (16-bit intermediate, so no extra rounding), then to the output matrix. Never left to FFmpeg's defaults.
 */
export function colorFilter(
	settings: Pick<H264EncodeSettings, "imageFormat" | "pixelFormat" | "colorSpace">,
): string {
	const tags = colorTags(settings.colorSpace, settings.pixelFormat);
	// setparams tags the frames themselves: FFmpeg 7 and later take the encoder's colour
	// metadata from the frames and ignore -color_primaries and -color_trc otherwise.
	const toYuv = `scale=in_range=pc:out_color_matrix=${tags.matrix}:out_range=tv:${SWS},format=${settings.pixelFormat},setparams=colorspace=${tags.colorspace}:color_primaries=${tags.primaries}:color_trc=${tags.trc}:range=tv`;
	if (settings.imageFormat === "png") return toYuv;
	return `scale=in_color_matrix=bt601:in_range=pc:${SWS},format=gbrp16le,${toYuv}`;
}

/** FFmpeg arguments for an H.264 MP4 encode from an image pipe on stdin. */
export function h264Args(s: H264EncodeSettings): string[] {
	const rate = frameRateArg(s.fps);
	const tags = colorTags(s.colorSpace, s.pixelFormat);
	return [
		"-hide_banner",
		"-loglevel",
		"error",
		"-progress",
		"pipe:1",
		"-nostats",
		"-f",
		"image2pipe",
		"-framerate",
		rate,
		"-c:v",
		s.imageFormat === "png" ? "png" : "mjpeg",
		"-i",
		"pipe:0",
		"-vf",
		colorFilter(s),
		"-c:v",
		"libx264",
		"-preset",
		s.preset,
		"-crf",
		String(s.crf),
		"-pix_fmt",
		s.pixelFormat,
		"-colorspace",
		tags.colorspace,
		"-color_primaries",
		tags.primaries,
		"-color_trc",
		tags.trc,
		"-color_range",
		"tv",
		"-r",
		rate,
		"-frames:v",
		String(s.frameCount),
		"-an",
		"-movflags",
		"+faststart",
		"-f",
		"mp4",
		"-y",
		s.output,
	];
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
		const child = spawn(ffmpeg, args, { stdio: ["pipe", "pipe", "pipe"] });
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
