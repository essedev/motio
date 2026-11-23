import type { ChildProcess } from "node:child_process";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join, normalize, resolve, sep } from "node:path";
import {
	type FrameLocation,
	MEDIA_ROUTES,
	type MediaInfo,
	type MediaServiceError,
} from "@motiojs/core/protocol";
import {
	FrameExtractor,
	type FrameSelection,
	networkInputArgs,
	run,
	selectFrame,
} from "@motiojs/video-frames";
import { MotioError } from "./errors.js";
import { assertFfmpegSupports, probeFfmpeg } from "./ffmpeg.js";

/** Options of `startMediaServer()`. */
export interface MediaServerOptions {
	/** URL the bundle is served from; media on its origin is read from `bundleDir` directly. */
	bundleUrl: string;
	/** Local directory behind `bundleUrl`, or null for a remote bundle. */
	bundleDir: string | null;
	ffmpeg: string;
	ffprobe: string;
}

/**
 * The renderer's media service (D-015, D-016): media information, the exact source frame for a
 * time, and where a native element must seek to show it. Listens on 127.0.0.1; the page reaches
 * it through `RunContext.mediaBaseUrl`.
 */
export interface MediaServer {
	/** Base URL of the routes, ending in `/`. */
	url: string;
	/** The file path or URL FFmpeg reads for a media URL the page uses; throws `E_MEDIA_SOURCE`. */
	resolveSource(src: string): Promise<string>;
	/** Media information of a resolved source, probed once. */
	info(input: string): Promise<MediaInfo>;
	/** Stops listening and kills every FFmpeg and FFprobe process the service started. */
	close(): Promise<void>;
}

interface ProbeJson {
	format?: { duration?: string };
	streams?: {
		codec_type?: string;
		width?: number;
		height?: number;
		duration?: string;
		nb_frames?: string;
	}[];
}

/** A media service FFprobe or FFmpeg run is killed after this many milliseconds. */
const MEDIA_PROCESS_TIMEOUT_MS = 120_000;

async function runProbe(
	ffprobe: string,
	input: string,
	children: Set<ChildProcess>,
): Promise<ProbeJson> {
	const out = await run(
		ffprobe,
		[
			...networkInputArgs(input),
			"-v",
			"error",
			"-show_entries",
			"format=duration:stream=codec_type,width,height,duration",
			"-of",
			"json",
			input,
		],
		{ timeoutMs: MEDIA_PROCESS_TIMEOUT_MS, track: children },
	);
	return JSON.parse(out.toString()) as ProbeJson;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
	const data = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(data),
		"access-control-allow-origin": "*",
		"cache-control": "no-store",
	});
	res.end(data);
}

function sendError(res: ServerResponse, status: number, code: string, message: string): void {
	const body: MediaServiceError = { code, message };
	sendJson(res, status, body);
}

function parseTime(value: string | null): number | null {
	if (value === null) return null;
	const t = Number(value);
	return Number.isFinite(t) && t >= 0 ? t : null;
}

function parseMode(value: string | null): FrameSelection | null {
	return value === "floor" || value === "nearest" ? value : null;
}

/** Starts the media service. */
export async function startMediaServer(options: MediaServerOptions): Promise<MediaServer> {
	const extractor = new FrameExtractor({
		ffmpeg: options.ffmpeg,
		ffprobe: options.ffprobe,
		timeoutMs: MEDIA_PROCESS_TIMEOUT_MS,
	});
	/** FFprobe runs of `info()`; the extractor tracks its own processes. */
	const children = new Set<ChildProcess>();
	let closed = false;
	const bundleOrigin = new URL(options.bundleUrl).origin;
	const root = options.bundleDir === null ? null : resolve(options.bundleDir);
	const infos = new Map<string, Promise<MediaInfo>>();

	const resolveSource = async (src: string): Promise<string> => {
		let url: URL;
		try {
			url = new URL(src);
		} catch {
			throw new MotioError(
				"E_MEDIA_SOURCE",
				`"${src}" is not an absolute URL. Media sources must be URLs, for example from staticFile().`,
				{ details: { src } },
			);
		}
		if (root !== null && url.origin === bundleOrigin) {
			let pathname: string;
			try {
				pathname = decodeURIComponent(url.pathname);
			} catch {
				throw new MotioError("E_MEDIA_SOURCE", `"${src}" has an invalid path.`, {
					details: { src },
				});
			}
			const file = normalize(join(root, pathname));
			if (file !== root && !file.startsWith(root + sep)) {
				throw new MotioError("E_MEDIA_SOURCE", `"${src}" points outside the bundle.`, {
					details: { src },
				});
			}
			const info = await stat(file).catch(() => null);
			if (!info?.isFile()) {
				throw new MotioError(
					"E_MEDIA_SOURCE",
					`The media file ${src} does not exist in the bundle (looked for ${file}). Check the path passed to staticFile() and that the file is in public/.`,
					{ details: { src, file } },
				);
			}
			return file;
		}
		if (url.protocol === "http:" || url.protocol === "https:") return url.href;
		throw new MotioError(
			"E_MEDIA_SOURCE",
			`Media from ${url.protocol} URLs cannot be read by the renderer: ${src.slice(0, 80)}. Use an http(s) URL or a file in public/ with staticFile().`,
			{ details: { src: src.slice(0, 200) } },
		);
	};

	const info = (input: string): Promise<MediaInfo> => {
		let p = infos.get(input);
		if (!p) {
			if (closed) {
				return Promise.reject(
					new MotioError("E_MEDIA_SOURCE", `The media service is closed (${input}).`, {
						details: { src: input },
					}),
				);
			}
			p = runProbe(options.ffprobe, input, children).then(
				(json) => {
					const streams = json.streams ?? [];
					const video = streams.find((s) => s.codec_type === "video" && s.width && s.height);
					const durations = [
						Number(json.format?.duration),
						...streams.map((s) => Number(s.duration)),
					].filter((d) => Number.isFinite(d) && d > 0);
					const out: MediaInfo = {
						durationInSeconds: durations.length ? Math.max(...durations) : null,
						video: video
							? { width: video.width as number, height: video.height as number, frameCount: 0 }
							: null,
						audioStreams: streams.filter((s) => s.codec_type === "audio").length,
					};
					return out;
				},
				(err: unknown) => {
					throw new MotioError(
						"E_MEDIA_SOURCE",
						`Could not read ${input}: ${err instanceof Error ? err.message : String(err)}`,
						{ details: { src: input } },
						err,
					);
				},
			);
			p.catch(() => infos.delete(input));
			infos.set(input, p);
		}
		return p;
	};

	const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
		if (req.method === "OPTIONS") {
			res.writeHead(204, {
				"access-control-allow-origin": "*",
				"access-control-allow-methods": "GET",
			});
			res.end();
			return;
		}
		if (req.method !== "GET") {
			sendError(res, 405, "E_METHOD", "Only GET is supported.");
			return;
		}
		const url = new URL(req.url ?? "/", "http://localhost");
		const name = url.pathname.replace(/^\/+/, "");
		const src = url.searchParams.get("src");
		if (!src) {
			sendError(res, 400, "E_MEDIA_SOURCE", "The src parameter is missing.");
			return;
		}
		const input = await resolveSource(src);
		if (name === MEDIA_ROUTES.info) {
			const result = await info(input);
			if (result.video) {
				const video = await extractor.info(input);
				result.video = { ...result.video, frameCount: video.timestamps.length };
			}
			sendJson(res, 200, result);
			return;
		}
		if (name !== MEDIA_ROUTES.frame && name !== MEDIA_ROUTES.locate) {
			sendError(res, 404, "E_NOT_FOUND", `Unknown media route "${name}".`);
			return;
		}
		const t = parseTime(url.searchParams.get("t"));
		const mode = parseMode(url.searchParams.get("mode"));
		if (t === null || mode === null) {
			sendError(
				res,
				400,
				"E_INVALID",
				"t must be a non-negative number and mode floor or nearest.",
			);
			return;
		}
		// Renders check FFmpeg before they start; stills and frame sequences reach FFmpeg only
		// here, when the composition shows a video (probed once per executable).
		assertFfmpegSupports(await probeFfmpeg(options.ffmpeg), { encoders: [], decoders: [] });
		const { timestamps } = await extractor.info(input);
		const index = selectFrame(timestamps, t, mode);
		if (name === MEDIA_ROUTES.locate) {
			const timestamp = timestamps[index] ?? 0;
			const prev = timestamps[index - 1];
			const next =
				timestamps[index + 1] ?? timestamp + (prev === undefined ? 1 / 30 : timestamp - prev);
			const body: FrameLocation = { index, timestamp, seekTime: (timestamp + next) / 2 };
			sendJson(res, 200, body);
			return;
		}
		const alpha = url.searchParams.get("alpha") === "1";
		const png = await extractor.frame(input, index, { alpha });
		res.writeHead(200, {
			"content-type": "image/png",
			"content-length": png.length,
			"access-control-allow-origin": "*",
			"cache-control": "max-age=3600",
		});
		res.end(png);
	};

	const server: Server = createServer((req, res) => {
		handle(req, res).catch((err: unknown) => {
			if (res.headersSent) {
				res.destroy(err instanceof Error ? err : new Error(String(err)));
				return;
			}
			const code =
				err && typeof err === "object" && "code" in err && typeof err.code === "string"
					? err.code
					: "E_MEDIA";
			const status = code === "E_MEDIA_SOURCE" ? 404 : 500;
			sendError(res, status, code, err instanceof Error ? err.message : String(err));
		});
	});
	await new Promise<void>((ok, fail) => {
		server.once("error", fail);
		server.listen(0, "127.0.0.1", () => ok());
	});
	const addr = server.address();
	const port = typeof addr === "object" && addr ? addr.port : 0;
	return {
		url: `http://127.0.0.1:${port}/`,
		resolveSource,
		info,
		close: () =>
			new Promise<void>((ok) => {
				closed = true;
				extractor.close();
				for (const child of children) child.kill("SIGKILL");
				children.clear();
				server.closeAllConnections();
				server.close(() => ok());
			}),
	};
}
