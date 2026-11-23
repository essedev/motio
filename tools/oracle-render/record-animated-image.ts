// Records the published <AnimatedImage> of `remotion` in the pinned chrome-headless-shell
// (animated-image-probe.tsx, public API only): which frame of each fixture image the canvas shows
// at every composition frame, over formats, frame rates, playback rates, loop behaviours and
// sequence props; the canvas markup for size and fit props; the failures of invalid props and
// unloadable files. Images come from fixtures/animated-image (generate.mjs).
// Writes fixtures/animated-image/__golden__/remotion/animated-image.json.
// Run: pnpm record:animated-image
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import type { AnimatedImageProbeSpec } from "./animated-image-probe.tsx";

const here = import.meta.dirname;
const root = resolve(here, "../..");
const fixture = join(root, "fixtures/animated-image");
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
const chrome =
	process.env.MOTIO_BROWSER_EXECUTABLE ??
	resolve(
		process.env.HOME ?? "",
		".cache/motio/browsers/chrome-headless-shell/mac_arm-158.0.8127.36/chrome-headless-shell-mac-arm64/chrome-headless-shell",
	);
const description = JSON.parse(readFileSync(join(fixture, "frames.json"), "utf8")) as {
	colors: number[][];
};
const TYPES: Record<string, string> = {
	gif: "image/gif",
	png: "image/png",
	webp: "image/webp",
	avif: "image/avif",
};

const js =
	(
		await build({
			stdin: {
				contents: `import { runAnimatedImageProbe } from "./animated-image-probe.tsx"; window.runAnimatedImageProbe = runAnimatedImageProbe;`,
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
	if (path === "/not-an-image.gif") {
		res.writeHead(200, { "content-type": "image/gif" }).end("not an image");
		return;
	}
	try {
		const body = readFileSync(join(fixture, "public", path.slice(1)));
		res.writeHead(200, { "content-type": TYPES[path.split(".").pop() ?? ""] ?? "" }).end(body);
	} catch {
		res.writeHead(404, { "content-type": "text/plain" }).end("Not Found");
	}
});
await new Promise<void>((done) => server.listen(0, done));
const address = server.address();
const origin = `http://localhost:${typeof address === "object" && address ? address.port : 0}`;

const size = { width: 100, height: 100 };
const timing: AnimatedImageProbeSpec["timing"] = [];
for (const playbackRate of [1, 0.5, 1.7, 2]) {
	timing.push({ src: "/frames.gif", fps: 30, props: { ...size, playbackRate }, lastFrame: 60 });
}
for (const format of ["png", "webp", "avif"]) {
	timing.push({ src: `/frames.${format}`, fps: 30, props: size, lastFrame: 40 });
}
for (const fps of [24, 60]) {
	timing.push({ src: "/frames.gif", fps, props: size, lastFrame: fps === 60 ? 80 : 40 });
}
for (const loopBehavior of ["pause-after-finish", "clear-after-finish"]) {
	for (const playbackRate of [1, 1.7]) {
		timing.push({
			src: "/frames.gif",
			fps: 30,
			props: { ...size, loopBehavior, playbackRate },
			lastFrame: 40,
		});
	}
}
timing.push({ src: "/short-delays.gif", fps: 60, props: size, lastFrame: 20 });
timing.push({
	src: "/frames.gif",
	fps: 30,
	props: { ...size, from: 5, trimBefore: 6 },
	lastFrame: 30,
});

const spec: AnimatedImageProbeSpec = {
	colors: description.colors,
	timing,
	markup: [
		{ src: "/frames.gif", props: {} },
		{ src: "/frames.gif", props: { width: 200, height: 100 } },
		{ src: "/frames.gif", props: { width: 200, height: 100, fit: "contain" } },
		{ src: "/frames.gif", props: { width: 200, height: 100, fit: "cover" } },
		{ src: "/frames.gif", props: { width: 120 } },
		{ src: "/frames.gif", props: { style: { width: 200, height: 100 } } },
		{ src: "/frames.gif", props: { width: 80, height: 60, className: "a", id: "b" } },
		{ src: "/frames.gif", props: { width: 80, height: 60, style: { opacity: 0.5 } } },
	],
	invalid: [
		{ src: "/frames.gif", props: { playbackRate: -1 } },
		{ src: "/frames.gif", props: { playbackRate: 0 } },
		{ src: "/frames.gif", props: { playbackRate: Number.NaN } },
		{ src: "/frames.gif", props: { loopBehavior: "x" } },
		{ src: "/frames.gif", props: { fit: "nope" } },
		{ src: "/missing.gif", props: {} },
		{ src: "/missing.gif", props: { onError: true } },
		{ src: "/not-an-image.gif", props: { onError: true } },
	],
};

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
let result: unknown;
try {
	const page = await browser.newPage();
	await page.goto(`${origin}/`);
	result = await page.evaluate(
		(s) =>
			(
				window as unknown as { runAnimatedImageProbe(spec: unknown): Promise<unknown> }
			).runAnimatedImageProbe(s),
		spec as never,
	);
} finally {
	await browser.close();
	server.close();
}

const outDir = join(fixture, "__golden__/remotion");
mkdirSync(outDir, { recursive: true });
writeFileSync(
	join(outDir, "animated-image.json"),
	`${JSON.stringify({
		package: "remotion",
		version: pkg.dependencies.remotion,
		chrome: "158.0.8127.36",
		description:
			"<AnimatedImage> in a Thumbnail: timing[].frames is the fixture frame (index into frames.json colours) the canvas centre shows at each composition frame, 'clear' when transparent, null without a canvas; markup after the first frame is drawn; failures of invalid props.",
		...(result as object),
	}).replaceAll(origin, "{origin}")}\n`,
);
console.log("animated-image.json recorded");
