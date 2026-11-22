// Static server shared by the media-utils oracle recorder and Motio's browser tests. Serves the
// fixture assets with HTTP Range support, optionally with CORS (to act as a second origin), and
// logs every request so tests can assert on request headers.
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

const types: Record<string, string> = {
	".wav": "audio/wav",
	".mp3": "audio/mpeg",
	".mp4": "video/mp4",
	".png": "image/png",
	".jpg": "image/jpeg",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
};

/** One logged request. */
export interface LoggedRequest {
	method: string;
	path: string;
	range: string | null;
	probeHeader: string | null;
}

/** Maps a request path to a fixture file: `/m/*` media, `/f/*` composition assets, else ours. */
export function fixturePath(path: string): string {
	if (path.startsWith("/m/")) return join(root, "fixtures/media/public", path.slice(3));
	if (path.startsWith("/f/")) return join(root, "fixtures/compositions/public", path.slice(3));
	return join(root, "fixtures/media-utils/public", path.slice(1));
}

/** Starts a server on a free port; `/` answers `html`. */
export function startFixtureServer(
	html: string,
	options: { cors: boolean; log: LoggedRequest[] },
): Promise<{ server: Server; origin: string }> {
	const server = createServer((req, res) => {
		const url = new URL(req.url ?? "/", "http://localhost");
		const header = req.headers["x-motio-probe"];
		options.log.push({
			method: req.method ?? "GET",
			path: url.pathname,
			range: req.headers.range ?? null,
			probeHeader: typeof header === "string" ? header : null,
		});
		const headers: Record<string, string> = { "accept-ranges": "bytes" };
		if (options.cors) {
			headers["access-control-allow-origin"] = "*";
			headers["access-control-allow-headers"] = "range, x-motio-probe";
			headers["access-control-expose-headers"] = "content-range, content-length";
		}
		if (req.method === "OPTIONS") {
			res.writeHead(204, headers).end();
			return;
		}
		if (url.pathname === "/") {
			res.writeHead(200, { ...headers, "content-type": "text/html" }).end(html);
			return;
		}
		const file = fixturePath(decodeURIComponent(url.pathname));
		headers["content-type"] = types[extname(file)] ?? "application/octet-stream";
		if (!existsSync(file)) {
			res.writeHead(404, headers).end("Not Found");
			return;
		}
		const body = readFileSync(file);
		const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
		if (range) {
			const [, a = "", b = ""] = range;
			const start = a === "" ? Math.max(0, body.length - Number(b)) : Number(a);
			const end = a !== "" && b !== "" ? Math.min(Number(b), body.length - 1) : body.length - 1;
			res
				.writeHead(206, {
					...headers,
					"content-range": `bytes ${start}-${end}/${body.length}`,
					"content-length": String(end - start + 1),
				})
				.end(req.method === "HEAD" ? undefined : body.subarray(start, end + 1));
			return;
		}
		res
			.writeHead(200, { ...headers, "content-length": String(body.length) })
			.end(req.method === "HEAD" ? undefined : body);
	});
	return new Promise((done) => {
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address() as { port: number };
			done({ server, origin: `http://127.0.0.1:${port}` });
		});
	});
}
