// Records the published @remotion/gif in the pinned chrome-headless-shell (gif-probe.tsx, public
// API only): getGifDurationInSeconds() over GIFs with chosen delays, served with chosen content
// types and failures; what <Gif onLoad> reports (delays, sizes, a hash of every decoded frame);
// which frame the canvas shows at each composition frame; the canvas markup; invalid props.
// GIFs are encoded by fixtures/gif/encode.mjs. Writes packages/gif/src/__oracle__/gif.json.
// Run: pnpm record:gif
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import { encode, image } from "../../fixtures/gif/encode.mjs";
import type { GifProbeSpec } from "./gif-probe.tsx";

const here = import.meta.dirname;
const root = resolve(here, "../..");
const out = join(root, "packages/gif/src/__oracle__/gif.json");
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
const chrome =
	process.env.MOTIO_BROWSER_EXECUTABLE ??
	resolve(
		process.env.HOME ?? "",
		".cache/motio/browsers/chrome-headless-shell/mac_arm-158.0.8127.36/chrome-headless-shell-mac-arm64/chrome-headless-shell",
	);

const PALETTE = [
	[255, 0, 0],
	[0, 128, 255],
	[255, 255, 255],
	[0, 0, 0],
];
const frame = (delay: number, color: number, extra: Record<string, unknown> = {}) => ({
	x: 0,
	y: 0,
	width: 4,
	height: 4,
	delay,
	disposal: 1,
	indices: image(4, 4, (x: number, y: number) => ((x + y) % 2 === 0 ? color : 2)),
	...extra,
});
const gifs: Record<string, Buffer> = {
	"counter.gif": readFileSync(join(root, "fixtures/gif/public/counter.gif")),
	"sprite.gif": readFileSync(join(root, "fixtures/gif/public/sprite.gif")),
};
for (const delay of [0, 1, 2, 3, 5, 9, 10, 11, 20, 100, 65535]) {
	gifs[`delay-${delay}.gif`] = encode({
		width: 4,
		height: 4,
		colors: PALETTE,
		frames: [frame(delay, 0)],
	});
}
for (const delays of [
	[0, 0],
	[1, 0],
	[3, 7],
	[2, 2, 2],
]) {
	gifs[`delays-${delays.join("-")}.gif`] = encode({
		width: 4,
		height: 4,
		colors: PALETTE,
		frames: delays.map((d, i) => frame(d, i % 2)),
	});
}
gifs["no-control.gif"] = encode({
	width: 4,
	height: 4,
	colors: PALETTE,
	frames: [frame(0, 0, { noControl: true }), frame(0, 1, { noControl: true })],
});
gifs["no-loop-block.gif"] = encode({
	width: 4,
	height: 4,
	colors: PALETTE,
	loop: undefined,
	frames: [frame(4, 0), frame(6, 1)],
});

const png = readFileSync(join(root, "fixtures/compositions/public/photo.png"));
const counter = gifs["counter.gif"] as Buffer;
const special: Record<string, { status: number; type: string | null; body: Buffer }> = {
	"/not-a-gif.gif": { status: 200, type: "image/gif", body: png },
	"/truncated.gif": { status: 200, type: "image/gif", body: counter.subarray(0, 2000) },
	"/empty.gif": { status: 200, type: "image/gif", body: Buffer.alloc(0) },
	"/missing.gif": { status: 404, type: "text/plain", body: Buffer.from("Not Found") },
};
const CONTENT_TYPES = ["image/gif", "image/png", "application/octet-stream", "text/plain", "none"];

const js =
	(
		await build({
			stdin: {
				contents: `import { runGifProbe } from "./gif-probe.tsx"; window.runGifProbe = runGifProbe;`,
				resolveDir: here,
				loader: "ts",
			},
			bundle: true,
			write: false,
			format: "iife",
			platform: "browser",
			jsx: "automatic",
			define: { "process.env.NODE_ENV": '"production"' },
		})
	).outputFiles[0]?.text ?? "";
const html = `<!doctype html><html><body style="margin:0"><script>${js}</script></body></html>`;

const server = createServer((req, res) => {
	const path = new URL(req.url ?? "/", "http://localhost").pathname;
	if (path === "/") {
		res.writeHead(200, { "content-type": "text/html" }).end(html);
		return;
	}
	const fixed = special[path];
	if (fixed) {
		res.writeHead(fixed.status, fixed.type ? { "content-type": fixed.type } : {}).end(fixed.body);
		return;
	}
	const typed = path.match(/^\/ct\/([^/]+)\/(.+)$/);
	if (typed) {
		const type = decodeURIComponent(typed[1] as string);
		res
			.writeHead(200, type === "none" ? {} : { "content-type": type })
			.end(gifs[typed[2] as string]);
		return;
	}
	const body = gifs[path.slice(1)];
	if (!body) {
		res.writeHead(404).end();
		return;
	}
	res.writeHead(200, { "content-type": "image/gif" }).end(body);
});
await new Promise<void>((done) => server.listen(0, done));
const address = server.address();
const origin = `http://localhost:${typeof address === "object" && address ? address.port : 0}`;

const names = Object.keys(gifs);
const timing: GifProbeSpec["timing"] = [];
for (const fps of [30, 24, 60]) {
	for (const [src, width, height] of [
		["/counter.gif", 160, 90],
		["/sprite.gif", 120, 120],
	] as const) {
		for (const playbackRate of [1, 0.5, 0.7, 1.3, 2, 3.1]) {
			timing.push({ src, fps, props: { width, height, playbackRate }, lastFrame: 120 });
		}
	}
}
for (const loopBehavior of ["loop", "pause-after-finish", "unmount-after-finish", "x"]) {
	for (const playbackRate of [1, 1.3]) {
		timing.push({
			src: "/counter.gif",
			fps: 30,
			props: { width: 160, height: 90, playbackRate, loopBehavior },
			lastFrame: 70,
		});
	}
}
const spec: GifProbeSpec = {
	durations: [
		...names.map((n) => `/${n}`),
		...CONTENT_TYPES.map((t) => `/ct/${encodeURIComponent(t)}/counter.gif`),
		...Object.keys(special),
	],
	loads: [...names.map((n) => `/${n}`), "/missing.gif", "/not-a-gif.gif", "/truncated.gif"],
	timing,
	markup: [
		{ src: "/counter.gif", props: {} },
		{ src: "/counter.gif", props: { width: 200, height: 100 } },
		{ src: "/counter.gif", props: { width: 200, height: 100, fit: "contain" } },
		{ src: "/counter.gif", props: { width: 200, height: 100, fit: "cover" } },
		{ src: "/counter.gif", props: { width: 100, height: 200, fit: "contain" } },
		{ src: "/counter.gif", props: { width: 100, height: 200, fit: "cover" } },
		{ src: "/counter.gif", props: { style: { width: 200, height: 100 } } },
		{ src: "/counter.gif", props: { width: 200, height: 100, style: { opacity: 0.5 } } },
		{ src: "/counter.gif", props: { width: 120, height: 80, className: "g", id: "x" } },
		{ src: "/sprite.gif", props: { width: 120, height: 120 } },
		{
			src: "/counter.gif",
			props: { style: { width: 200, height: 100, padding: 10, border: "5px solid red" } },
		},
		{ src: "/counter.gif", props: { style: { width: "50%", height: "25%" } } },
		{
			src: "/counter.gif",
			props: { style: { width: 200, height: 100 } },
			box: { transform: "scale(0.5)" },
		},
		{ src: "/counter.gif", props: { width: 200, height: 100, cropLeft: 0.1, cropBottom: 0.2 } },
		{ src: "/counter.gif", props: { width: 200, height: 100, from: 5, premountFor: 5 }, frame: 2 },
		{
			src: "/counter.gif",
			props: {
				width: 200,
				height: 100,
				from: 5,
				premountFor: 5,
				style: { opacity: 0.5 },
				styleWhilePremounted: { opacity: 0.2, display: "block" },
			},
			frame: 2,
		},
		{
			src: "/counter.gif",
			props: { width: 200, height: 100, durationInFrames: 5, postmountFor: 5 },
			frame: 7,
		},
		{ src: "/counter.gif", props: { width: 200, height: 100, from: 5 }, frame: 2 },
		{ src: "/counter.gif", props: { width: 200, height: 100, hidden: true } },
	],
	invalid: [
		{ src: "/counter.gif", props: { playbackRate: -1 } },
		{ src: "/counter.gif", props: { playbackRate: 0 } },
		{ src: "/counter.gif", props: { playbackRate: Number.NaN } },
		{ src: "/counter.gif", props: { playbackRate: "2" } },
		{ src: "/counter.gif", props: { fit: "nope" } },
		{ src: "/counter.gif", props: { loopBehavior: "x" } },
		{ props: {} },
		{ src: "", props: {} },
		{ src: "/missing.gif", props: {} },
	],
};

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
let result: unknown;
try {
	const page = await browser.newPage();
	await page.goto(`${origin}/`);
	result = await page.evaluate(
		(s) => (window as unknown as { runGifProbe(spec: unknown): Promise<unknown> }).runGifProbe(s),
		spec as never,
	);
} finally {
	await browser.close();
	server.close();
}

writeFileSync(
	out,
	`${JSON.stringify({
		package: "@remotion/gif",
		version: pkg.dependencies["@remotion/gif"],
		chrome: "158.0.8127.36",
		description:
			"@remotion/gif in Chrome: getGifDurationInSeconds() per URL, <Gif onLoad> payloads (frames as WxH:FNV-1a of the RGBA bytes), the decoded frame the canvas shows per composition frame in a Thumbnail, canvas markup after load, messages of invalid props. GIFs are encoded by fixtures/gif/encode.mjs (see record-gif.ts for the grid).",
		files: Object.fromEntries(
			Object.entries(gifs)
				.filter(([name]) => name !== "counter.gif" && name !== "sprite.gif")
				.map(([name, bytes]) => [name, bytes.toString("base64")]),
		),
		...(result as object),
	})}\n`,
);
console.log("gif.json recorded");
