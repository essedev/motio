import { spawn } from "node:child_process";
import { hashFrame } from "./hash.js";
import type { RgbaImage } from "./image.js";

/** Stream properties of the first video stream, as reported by `ffprobe`. */
export interface VideoProbe {
	codec: string;
	width: number;
	height: number;
	pixelFormat: string;
	/** `r_frame_rate` as a number. */
	fps: number;
	/** `r_frame_rate` as ffprobe prints it, e.g. `30/1`. */
	frameRate: string;
	/** Frames counted by decoding the stream (`nb_read_frames`). */
	frameCount: number;
	colorSpace: string | null;
	colorPrimaries: string | null;
	colorTransfer: string | null;
	colorRange: string | null;
}

/** Executables used by the helpers; default to `ffmpeg` and `ffprobe` on `PATH`. */
export interface FfmpegTools {
	ffmpeg?: string;
	ffprobe?: string;
}

function run(cmd: string, args: string[]): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
		const out: Buffer[] = [];
		const err: Buffer[] = [];
		child.stdout.on("data", (c: Buffer) => out.push(c));
		child.stderr.on("data", (c: Buffer) => err.push(c));
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolve(Buffer.concat(out));
			else reject(new Error(`${cmd} exited with ${code}: ${Buffer.concat(err).toString().trim()}`));
		});
	});
}

function parseRate(rate: string): number {
	const [num, den] = rate.split("/").map(Number);
	return den ? (num ?? 0) / den : (num ?? 0);
}

/** Probes the first video stream of `path`, counting frames by decoding them. */
export async function probeVideo(path: string, tools: FfmpegTools = {}): Promise<VideoProbe> {
	const out = await run(tools.ffprobe ?? "ffprobe", [
		"-v",
		"error",
		"-select_streams",
		"v:0",
		"-count_frames",
		"-show_entries",
		"stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_read_frames,color_space,color_primaries,color_transfer,color_range",
		"-of",
		"json",
		path,
	]);
	const parsed = JSON.parse(out.toString()) as { streams?: Record<string, string | number>[] };
	const s = parsed.streams?.[0];
	if (!s) throw new Error(`no video stream in ${path}`);
	const str = (k: string): string | null => (s[k] === undefined ? null : String(s[k]));
	return {
		codec: String(s.codec_name),
		width: Number(s.width),
		height: Number(s.height),
		pixelFormat: String(s.pix_fmt),
		fps: parseRate(String(s.r_frame_rate)),
		frameRate: String(s.r_frame_rate),
		frameCount: Number(s.nb_read_frames),
		colorSpace: str("color_space"),
		colorPrimaries: str("color_primaries"),
		colorTransfer: str("color_transfer"),
		colorRange: str("color_range"),
	};
}

/** How to interpret the YUV samples of the video when converting back to RGB. */
export interface DecodeOptions extends FfmpegTools {
	/** YUV matrix of the stream. Default `bt709`. */
	colorMatrix?: "bt709" | "bt601" | "bt2020";
	/** Range of the stream. Default `tv` (limited). */
	range?: "tv" | "pc";
}

/**
 * Decodes every frame of `path` to RGBA with an explicit YUV to RGB conversion (never FFmpeg's
 * guess), yielding frames in presentation order.
 */
export async function* decodeVideoFrames(
	path: string,
	options: DecodeOptions = {},
): AsyncGenerator<RgbaImage & { index: number }> {
	const probe = await probeVideo(path, options);
	const { width, height } = probe;
	const frameBytes = width * height * 4;
	const matrix = options.colorMatrix ?? "bt709";
	const range = options.range ?? "tv";
	const child = spawn(
		options.ffmpeg ?? "ffmpeg",
		[
			"-v",
			"error",
			"-i",
			path,
			"-vf",
			`scale=in_color_matrix=${matrix}:in_range=${range}:out_range=pc:flags=accurate_rnd+full_chroma_int,format=rgba`,
			"-f",
			"rawvideo",
			"-",
		],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	const err: Buffer[] = [];
	child.stderr.on("data", (c: Buffer) => err.push(c));
	const closed = new Promise<number | null>((resolve, reject) => {
		child.on("error", reject);
		child.on("close", resolve);
	});
	let pending: Buffer = Buffer.alloc(0);
	let index = 0;
	try {
		for await (const chunk of child.stdout as AsyncIterable<Buffer>) {
			pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
			while (pending.length >= frameBytes) {
				const data = new Uint8Array(pending.subarray(0, frameBytes));
				pending = pending.subarray(frameBytes);
				yield { index: index++, width, height, data };
			}
		}
	} finally {
		if (child.exitCode === null) child.kill("SIGKILL");
	}
	const code = await closed;
	if (code !== 0 && code !== null) {
		throw new Error(`ffmpeg exited with ${code}: ${Buffer.concat(err).toString().trim()}`);
	}
	if (pending.length !== 0)
		throw new Error(`trailing ${pending.length} bytes after the last frame`);
}

/** SHA-256 of every decoded frame of `path`, in order. */
export async function hashVideoFrames(
	path: string,
	options: DecodeOptions = {},
): Promise<string[]> {
	const hashes: string[] = [];
	for await (const frame of decodeVideoFrames(path, options)) hashes.push(hashFrame(frame.data));
	return hashes;
}

/** Decodes a PNG, JPEG or WebP image to RGBA with FFmpeg. */
export async function decodeImage(image: Uint8Array, tools: FfmpegTools = {}): Promise<RgbaImage> {
	const ffmpeg = tools.ffmpeg ?? "ffmpeg";
	const probe = await new Promise<{ width: number; height: number }>((resolve, reject) => {
		const child = spawn(
			tools.ffprobe ?? "ffprobe",
			["-v", "error", "-show_entries", "stream=width,height", "-of", "json", "-i", "-"],
			{ stdio: ["pipe", "pipe", "pipe"] },
		);
		const out: Buffer[] = [];
		child.stdout.on("data", (c: Buffer) => out.push(c));
		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) return reject(new Error(`ffprobe exited with ${code}`));
			const s = (
				JSON.parse(Buffer.concat(out).toString()) as {
					streams: { width: number; height: number }[];
				}
			).streams[0];
			if (!s) return reject(new Error("no image stream"));
			resolve({ width: s.width, height: s.height });
		});
		child.stdin.on("error", () => {
			// ffprobe may close stdin once it has read the header; the exit code reports real failures.
		});
		child.stdin.end(image);
	});
	const data = await new Promise<Buffer>((resolve, reject) => {
		const child = spawn(
			ffmpeg,
			["-v", "error", "-i", "-", "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
			{ stdio: ["pipe", "pipe", "pipe"] },
		);
		const out: Buffer[] = [];
		const err: Buffer[] = [];
		child.stdout.on("data", (c: Buffer) => out.push(c));
		child.stderr.on("data", (c: Buffer) => err.push(c));
		child.on("error", reject);
		child.on("close", (code) =>
			code === 0
				? resolve(Buffer.concat(out))
				: reject(new Error(`ffmpeg exited with ${code}: ${Buffer.concat(err).toString().trim()}`)),
		);
		child.stdin.end(image);
	});
	return { width: probe.width, height: probe.height, data: new Uint8Array(data) };
}
