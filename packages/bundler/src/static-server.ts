import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, relative, sep } from "node:path";

const CONTENT_TYPES: Record<string, string> = {
	".aac": "audio/aac",
	".avif": "image/avif",
	".css": "text/css; charset=utf-8",
	".flac": "audio/flac",
	".gif": "image/gif",
	".htm": "text/html; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".lottie": "application/zip",
	".m4a": "audio/mp4",
	".mjs": "text/javascript; charset=utf-8",
	".mkv": "video/x-matroska",
	".mov": "video/quicktime",
	".mp3": "audio/mpeg",
	".mp4": "video/mp4",
	".oga": "audio/ogg",
	".ogg": "audio/ogg",
	".ogv": "video/ogg",
	".opus": "audio/ogg",
	".otf": "font/otf",
	".pdf": "application/pdf",
	".png": "image/png",
	".srt": "text/plain; charset=utf-8",
	".svg": "image/svg+xml",
	".ttf": "font/ttf",
	".txt": "text/plain; charset=utf-8",
	".vtt": "text/vtt; charset=utf-8",
	".wasm": "application/wasm",
	".wav": "audio/wav",
	".webm": "video/webm",
	".webp": "image/webp",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".xml": "application/xml",
};

/** The content type served for a file name. */
export function contentTypeFor(name: string): string {
	return CONTENT_TYPES[extname(name).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Parses a `Range` header against a file size. Returns the inclusive byte range, `null` for
 * no (or an ignored multi-range) header, or `"unsatisfiable"`.
 */
export function parseRange(
	header: string | undefined,
	size: number,
): { start: number; end: number } | null | "unsatisfiable" {
	if (!header) return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return null;
	const [, from = "", to = ""] = match;
	if (from === "" && to === "") return null;
	let start: number;
	let end: number;
	if (from === "") {
		// A suffix: the last `to` bytes.
		const length = Number(to);
		if (length === 0) return "unsatisfiable";
		start = Math.max(0, size - length);
		end = size - 1;
	} else {
		start = Number(from);
		end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
	}
	if (start >= size || start > end) return "unsatisfiable";
	return { start, end };
}

/** Decodes a URL path to a path inside `root`, or null when it escapes it or is malformed. */
function resolveInside(root: string, pathname: string): string | null {
	let segments: string[];
	try {
		segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
	} catch {
		return null;
	}
	if (segments.some((s) => s === ".." || s.includes("/") || s.includes("\\") || s.includes("\0"))) {
		return null;
	}
	const path = join(root, ...segments);
	const inside = relative(root, path);
	return inside && !inside.startsWith(`..${sep}`) && inside !== ".." ? path : null;
}

/**
 * Serves the files of a directory under the URL root, with `Range` support (seeking a
 * `<video>` needs it, see D-016) and names encoded the way `staticFile()` encodes them,
 * including `#` and `?`. Calls `next()` for anything that is not a file there.
 */
export function serveStaticFiles(root: string) {
	return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
		const pathname = (req.url ?? "/").split("?")[0] ?? "/";
		const path =
			req.method === "GET" || req.method === "HEAD" ? resolveInside(root, pathname) : null;
		if (!path) {
			next();
			return;
		}
		stat(path).then(
			(info) => {
				if (!info.isFile()) {
					next();
					return;
				}
				const range = parseRange(req.headers.range, info.size);
				const headers: Record<string, string | number> = {
					"content-type": contentTypeFor(path),
					"accept-ranges": "bytes",
					"cache-control": "no-cache",
					"last-modified": info.mtime.toUTCString(),
				};
				if (range === "unsatisfiable") {
					res.writeHead(416, { ...headers, "content-range": `bytes */${info.size}` }).end();
					return;
				}
				const { start, end } = range ?? { start: 0, end: info.size - 1 };
				const length = info.size === 0 ? 0 : end - start + 1;
				res.writeHead(range ? 206 : 200, {
					...headers,
					"content-length": length,
					...(range ? { "content-range": `bytes ${start}-${end}/${info.size}` } : {}),
				});
				if (req.method === "HEAD" || length === 0) {
					res.end();
					return;
				}
				const stream = createReadStream(path, { start, end });
				stream.on("error", () => res.destroy());
				res.on("close", () => stream.destroy());
				stream.pipe(res);
			},
			(error: { code?: string }) => {
				if (error.code === "ENOENT" || error.code === "ENOTDIR") next();
				else res.writeHead(500).end();
			},
		);
	};
}
