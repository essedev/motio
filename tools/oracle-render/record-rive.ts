// Records the published @remotion/rive in the pinned chrome-headless-shell (rive-probe.tsx, public
// API only): the animation instance's time (from the documented ref) at each composition frame
// rendered in order in a Thumbnail, over animations, frame rates and the inherited <Sequence>
// props; the canvas markup and ref after load; the errors of invalid props; the URLs the page
// requests. Rive files are fixtures/rive/public. Writes packages/rive/src/__oracle__/rive.json.
// Run: pnpm record:rive
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import type { RiveProbeSpec } from "./rive-probe.tsx";

const here = import.meta.dirname;
const root = resolve(here, "../..");
const out = join(root, "packages/rive/src/__oracle__/rive.json");
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
const chrome =
	process.env.MOTIO_BROWSER_EXECUTABLE ??
	resolve(
		process.env.HOME ?? "",
		".cache/motio/browsers/chrome-headless-shell/mac_arm-158.0.8127.36/chrome-headless-shell-mac-arm64/chrome-headless-shell",
	);
const assets = join(root, "fixtures/rive/public");

const js =
	(
		await build({
			stdin: {
				contents: `import { runRiveProbe } from "./rive-probe.tsx"; window.runRiveProbe = runRiveProbe;`,
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
	if (path === "/not-rive.riv") {
		res.writeHead(200, { "content-type": "application/octet-stream" }).end("not a rive file");
		return;
	}
	let body: Buffer;
	try {
		body = readFileSync(join(assets, path.slice(1)));
	} catch {
		res.writeHead(404, { "content-type": "text/plain" }).end("Not Found");
		return;
	}
	res.writeHead(200, { "content-type": "application/octet-stream" }).end(body);
});
await new Promise<void>((done) => server.listen(0, done));
const address = server.address();
const origin = `http://localhost:${typeof address === "object" && address ? address.port : 0}`;

const range = (from: number, to: number) =>
	Array.from({ length: to - from + 1 }, (_, i) => from + i);
const timing: RiveProbeSpec["timing"] = [];
// Frames in order, as one page of the renderer draws them. truck.riv: "bounce" plays once (1 s),
// "idle" loops (2 s), "curves" loops inside a work area (frames 77 to 198 at 60 fps).
for (const fps of [30, 60, 24]) {
	for (const animation of [undefined, "idle", 2]) {
		timing.push({
			src: "/truck.riv",
			fps,
			props: animation === undefined ? {} : { animation },
			frames: range(0, 150),
		});
	}
}
for (const props of [
	{ animation: "idle", playbackRate: 2 },
	{ animation: "idle", playbackRate: 0.5 },
	{ animation: "curves", playbackRate: 1.7 },
	{ animation: "idle", from: 10 },
	{ animation: "idle", trimBefore: 30 },
	{ animation: "idle", freeze: 20 },
	{ animation: "idle", loop: true, durationInFrames: 45 },
	{ animation: "bounce", loop: true, durationInFrames: 45 },
	{ artboard: "Avatar 1", animation: "idle", src: "/look.riv" },
	{ artboard: 3, animation: 3, src: "/look.riv" },
]) {
	const { src = "/truck.riv", ...rest } = props as Record<string, unknown> & { src?: string };
	timing.push({ src, fps: 30, props: rest, frames: range(0, 120) });
}
// Out of order: the first frame drawn and every jump.
for (const animation of ["bounce", "idle", "curves"]) {
	timing.push({
		src: "/truck.riv",
		fps: 30,
		props: { animation },
		frames: [45, 15, 90, 0, 100, 10],
	});
}

const spec: RiveProbeSpec = {
	timing,
	markup: [
		{ src: "/truck.riv", props: {} },
		{ src: "/truck.riv", props: { fit: "cover", alignment: "top-left" } },
		{ src: "/truck.riv", props: { fit: "none", alignment: "bottom-right" } },
		{ src: "/truck.riv", props: { className: "r", style: { opacity: 0.5, width: 200 } } },
		{ src: "/truck.riv", props: { cropLeft: 0.1, cropBottom: 0.2 } },
		{ src: "/truck.riv", props: { from: 5, premountFor: 5 }, frame: 2 },
		{
			src: "/truck.riv",
			props: {
				from: 5,
				premountFor: 5,
				style: { opacity: 0.5 },
				styleWhilePremounted: { opacity: 0.2, display: "block" },
			},
			frame: 2,
		},
		{ src: "/truck.riv", props: { durationInFrames: 5, postmountFor: 5 }, frame: 7 },
		{ src: "/truck.riv", props: { from: 5 }, frame: 2 },
		{ src: "/truck.riv", props: { hidden: true } },
		{ src: "/truck.riv", props: { name: "x", showInTimeline: false } },
		{ src: "/look.riv", props: { artboard: "All Avatars" } },
		{ src: "/look.riv", props: { artboard: 1, animation: "happy" } },
		{ src: "/truck.riv", props: { effects: [] } },
		{ src: "/truck.riv", props: { animation: "nope" } },
		{ src: "/truck.riv", props: { animation: 9 } },
		{ src: "/truck.riv", props: { animation: "idle" }, frame: 20 },
		{ src: "/truck.riv", props: { animation: "curves", fit: "fill" }, frame: 33 },
		{ src: "/truck.riv", props: { fit: "fit-width", alignment: "center-left" }, frame: 10 },
		{ src: "/truck.riv", props: { fit: "fit-height", alignment: "top-center" }, frame: 10 },
		{ src: "/truck.riv", props: { fit: "scale-down", alignment: "bottom-left" }, frame: 10 },
		{
			src: "/look.riv",
			props: { artboard: "Avatar 3", fit: "contain", alignment: "center-right" },
		},
		{ src: "/truck.riv", props: { enableRiveAssetCdn: false } },
	],
	invalid: [
		{ props: {} },
		{ src: "", props: {} },
		{ src: "/missing.riv", props: {} },
		{ src: "/not-rive.riv", props: {} },
		{ src: "/truck.riv", props: { artboard: "nope" } },
		{ src: "/truck.riv", props: { artboard: 7 } },
		{ src: "/truck.riv", props: { animation: "nope" } },
		{ src: "/truck.riv", props: { animation: 9 } },
		{ src: "/truck.riv", props: { fit: "nope" } },
		{ src: "/truck.riv", props: { alignment: "nope" } },
		{ src: "/truck.riv", props: { playbackRate: 0 } },
		{ src: "/truck.riv", props: { effects: [{}] } },
	],
};

const requests: string[] = [];
const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
let result: unknown;
try {
	const page = await browser.newPage();
	page.on("request", (request) => {
		const url = request.url();
		if (!url.startsWith(origin)) requests.push(url);
	});
	await page.goto(`${origin}/`);
	result = await page.evaluate(
		(s) => (window as unknown as { runRiveProbe(spec: unknown): Promise<unknown> }).runRiveProbe(s),
		spec as never,
	);
} finally {
	await browser.close();
	server.close();
}

writeFileSync(
	out,
	`${JSON.stringify({
		package: "@remotion/rive",
		version: pkg.dependencies["@remotion/rive"],
		chrome: "158.0.8127.36",
		description:
			"@remotion/rive in a Thumbnail (400x300): the LinearAnimationInstance's time and didLoop from the ref after each composition frame, rendered in the listed order; canvas markup, a FNV-1a hash of the canvas pixels and the ref after load; errors of invalid props (errorFallback, window errors, unhandled rejections); the external URLs the page requested. Rive files from fixtures/rive/public.",
		externalRequests: [...new Set(requests)],
		...(result as object),
	})}\n`,
);
console.log("rive.json recorded");
