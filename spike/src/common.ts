import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, resolve } from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";

export const CHROME =
	process.env.MOTIO_BROWSER_EXECUTABLE ??
	resolve(
		process.env.HOME ?? "",
		".cache/motio/browsers/chrome-headless-shell/mac_arm-158.0.8127.36/chrome-headless-shell-mac-arm64/chrome-headless-shell",
	);

export const DETERMINISM_FLAGS = [
	"--font-render-hinting=none",
	"--disable-lcd-text",
	"--force-color-profile=srgb",
	"--force-device-scale-factor=1",
	"--disable-background-timer-throttling",
	"--disable-backgrounding-occluded-windows",
	"--disable-renderer-backgrounding",
	"--use-gl=angle",
	"--use-angle=swiftshader",
	"--enable-unsafe-swiftshader",
	"--hide-scrollbars",
	"--mute-audio",
	...(process.env.MOTIO_CHROME_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
];

const TYPES: Record<string, string> = {
	".html": "text/html",
	".js": "text/javascript",
	".css": "text/css",
};

export function serve(dir: string): Promise<{ server: Server; url: string }> {
	return new Promise((ok) => {
		const server = createServer((req, res) => {
			const path = join(dir, decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/"));
			const file =
				existsSync(path) && statSync(path).isDirectory() ? join(path, "index.html") : path;
			if (!existsSync(file)) {
				res.writeHead(404).end();
				return;
			}
			const type = TYPES[extname(file)] ?? "application/octet-stream";
			const size = statSync(file).size;
			const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
			if (range) {
				const start = range[1] ? Number(range[1]) : 0;
				const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
				res.writeHead(206, {
					"content-type": type,
					"accept-ranges": "bytes",
					"content-range": `bytes ${start}-${end}/${size}`,
					"content-length": end - start + 1,
				});
				createReadStream(file, { start, end }).pipe(res);
				return;
			}
			res.writeHead(200, {
				"content-type": type,
				"accept-ranges": "bytes",
				"content-length": size,
			});
			createReadStream(file).pipe(res);
		});
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address();
			const port = typeof addr === "object" && addr ? addr.port : 0;
			ok({ server, url: `http://127.0.0.1:${port}/` });
		});
	});
}

export function launch(extra: string[] = []): Promise<Browser> {
	return puppeteer.launch({
		executablePath: CHROME,
		headless: true,
		args: [...DETERMINISM_FLAGS, ...extra],
		defaultViewport: { width: 1280, height: 720 },
	});
}
