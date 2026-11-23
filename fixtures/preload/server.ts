// Two-origin server shared by the @remotion/preload oracle recorder and Motio's preload tests.
// Origin A serves the page and the assets; origin B is another origin, which sends
// Access-Control-Allow-Origin only under /cors/. Paths: /media/<file>, /redirect/<n>/<path> (n
// hops of 302), /to-b/<path> (a redirect to B's /cors/<path>), /slow/<anything> (answers after
// 1 s), /__mark/... (204, marks the log). Every request is logged with the headers that show how
// it was made.
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

export const FILES: Record<string, { type: string; body: Buffer }> = {
	"ok.mp4": {
		type: "video/mp4",
		body: readFileSync(join(root, "fixtures/media/public/stamp-30.mp4")),
	},
	"ok.wav": { type: "audio/wav", body: readFileSync(join(root, "fixtures/media/public/tone.wav")) },
	"ok.png": {
		type: "image/png",
		body: readFileSync(join(root, "fixtures/compositions/public/photo.png")),
	},
	"ok.woff2": {
		type: "font/woff2",
		body: readFileSync(join(root, "fixtures/compositions/public/inter-400.woff2")),
	},
	twice: { type: "text/plain", body: Buffer.from("twice") },
};

/** One logged request. */
export interface Logged {
	server: "A" | "B";
	method: string;
	path: string;
	range: string | null;
	origin: string | null;
	dest: string | null;
	mode: string | null;
}

function sendFile(req: IncomingMessage, res: ServerResponse, name: string, headers: object) {
	const file = FILES[name];
	if (!file) {
		res.writeHead(404, { "content-type": "text/plain", ...headers }).end("Not Found");
		return;
	}
	const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
	const size = file.body.length;
	if (!range) {
		res
			.writeHead(200, {
				"content-type": file.type,
				"content-length": size,
				"accept-ranges": "bytes",
				...headers,
			})
			.end(file.body);
		return;
	}
	const start = Number(range[1]);
	const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
	res
		.writeHead(206, {
			"content-type": file.type,
			"content-length": end - start + 1,
			"content-range": `bytes ${start}-${end}/${size}`,
			"accept-ranges": "bytes",
			...headers,
		})
		.end(file.body.subarray(start, end + 1));
}

function serve(name: "A" | "B", html: string, log: Logged[], other: () => string): Promise<Server> {
	const server = createServer((req, res) => {
		const path = req.url ?? "/";
		const header = (h: string) => (req.headers[h] as string | undefined) ?? null;
		if (!path.startsWith("/favicon")) {
			log.push({
				server: name,
				method: req.method ?? "",
				path,
				range: header("range"),
				origin: header("origin"),
				dest: header("sec-fetch-dest"),
				mode: header("sec-fetch-mode"),
			});
		}
		if (path === "/") {
			res.writeHead(200, { "content-type": "text/html" }).end(html);
			return;
		}
		const cors = path.startsWith("/cors/");
		const rest = cors ? path.slice(5) : path;
		const headers = cors ? { "access-control-allow-origin": "*" } : {};
		const redirect = /^\/redirect\/(\d+)(\/.*)$/.exec(rest);
		if (redirect) {
			const hops = Number(redirect[1]);
			const next = hops <= 1 ? (redirect[2] as string) : `/redirect/${hops - 1}${redirect[2]}`;
			res.writeHead(302, { location: (cors ? "/cors" : "") + next, ...headers }).end();
			return;
		}
		if (rest.startsWith("/to-b/")) {
			res.writeHead(302, { location: `${other()}/cors/${rest.slice(6)}` }).end();
			return;
		}
		if (rest.startsWith("/slow/")) {
			setTimeout(() => sendFile(req, res, "twice", headers), 1000);
			return;
		}
		if (rest.startsWith("/media/")) {
			sendFile(req, res, rest.slice(7).split("?")[0] as string, headers);
			return;
		}
		if (rest.startsWith("/__mark")) {
			res.writeHead(204).end();
			return;
		}
		res.writeHead(404, { "content-type": "text/plain", ...headers }).end("Not Found");
	});
	return new Promise((done) => server.listen(0, () => done(server)));
}

/** Starts origin A (serving `html` at `/`) and origin B on free ports. */
export async function startPreloadServers(html: string): Promise<{
	originA: string;
	originB: string;
	log: Logged[];
	close: () => void;
}> {
	const log: Logged[] = [];
	let originB = "";
	const a = await serve("A", html, log, () => originB);
	const b = await serve("B", html, log, () => originB);
	const port = (s: Server) => (s.address() as { port: number }).port;
	originB = `http://127.0.0.1:${port(b)}`;
	return {
		originA: `http://localhost:${port(a)}`,
		originB,
		log,
		close: () => {
			a.close();
			b.close();
		},
	};
}
