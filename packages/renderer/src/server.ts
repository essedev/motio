import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { MotioError } from "./errors.js";

const TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".avif": "image/avif",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".otf": "font/otf",
	".wasm": "application/wasm",
	".mp4": "video/mp4",
	".webm": "video/webm",
	".mov": "video/quicktime",
	".mp3": "audio/mpeg",
	".wav": "audio/wav",
	".ogg": "audio/ogg",
	".m4a": "audio/mp4",
	".aac": "audio/aac",
};

/** A running static server. */
export interface StaticServer {
	url: string;
	close(): Promise<void>;
}

/**
 * Serves `dir` over HTTP on 127.0.0.1 (ES modules do not load from `file://`). Supports single
 * byte ranges, which media elements need. Requests outside `dir` get 404.
 */
export async function serveDirectory(dir: string, port = 0): Promise<StaticServer> {
	const root = resolve(dir);
	const server: Server = createServer((req, res) => {
		void (async () => {
			if (req.method !== "GET" && req.method !== "HEAD") {
				res.writeHead(405).end();
				return;
			}
			let pathname: string;
			try {
				pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
			} catch {
				res.writeHead(400).end();
				return;
			}
			let file = normalize(join(root, pathname));
			if (file !== root && !file.startsWith(root + sep)) {
				res.writeHead(404).end();
				return;
			}
			let info = await stat(file).catch(() => null);
			if (info?.isDirectory()) {
				file = join(file, "index.html");
				info = await stat(file).catch(() => null);
			}
			if (!info?.isFile()) {
				res.writeHead(404).end();
				return;
			}
			const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
			const headers: Record<string, string | number> = {
				"content-type": type,
				"accept-ranges": "bytes",
				"cache-control": "no-store",
			};
			const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
			let start = 0;
			let end = info.size - 1;
			let status = 200;
			if (range && (range[1] || range[2])) {
				if (range[1]) {
					start = Number(range[1]);
					if (range[2]) end = Math.min(Number(range[2]), info.size - 1);
				} else {
					start = Math.max(0, info.size - Number(range[2]));
				}
				if (start > end || start >= info.size) {
					res.writeHead(416, { "content-range": `bytes */${info.size}` }).end();
					return;
				}
				status = 206;
				headers["content-range"] = `bytes ${start}-${end}/${info.size}`;
			}
			headers["content-length"] = info.size === 0 ? 0 : end - start + 1;
			res.writeHead(status, headers);
			if (req.method === "HEAD" || info.size === 0) {
				res.end();
				return;
			}
			const stream = createReadStream(file, { start, end });
			stream.on("error", (err) => res.destroy(err));
			stream.pipe(res);
		})().catch((err: unknown) => {
			res.destroy(err instanceof Error ? err : new Error(String(err)));
		});
	});
	await new Promise<void>((ok, fail) => {
		server.once("error", fail);
		server.listen(port, "127.0.0.1", () => ok());
	}).catch((err: unknown) => {
		throw new MotioError(
			"E_SERVE_URL",
			`Could not start the bundle server on port ${port}: ${err instanceof Error ? err.message : String(err)}`,
			{},
			err,
		);
	});
	const addr = server.address();
	const actualPort = typeof addr === "object" && addr ? addr.port : port;
	return {
		url: `http://127.0.0.1:${actualPort}/`,
		close: () =>
			new Promise<void>((ok) => {
				server.closeAllConnections();
				server.close(() => ok());
			}),
	};
}

/**
 * Resolves `serveUrl`: an http(s) URL is used as is; a directory is served by a local server
 * that `close()` stops.
 */
export async function openServeUrl(serveUrl: string, port?: number): Promise<StaticServer> {
	if (/^https?:\/\//i.test(serveUrl)) return { url: serveUrl, close: async () => {} };
	const info = await stat(serveUrl).catch(() => null);
	if (!info?.isDirectory()) {
		throw new MotioError(
			"E_SERVE_URL",
			`serveUrl must be an http(s) URL or a bundle directory; "${serveUrl}" is ${info ? "not a directory" : "missing"}. Run the bundler first or check the path.`,
			{ details: { serveUrl } },
		);
	}
	return serveDirectory(serveUrl, port);
}
