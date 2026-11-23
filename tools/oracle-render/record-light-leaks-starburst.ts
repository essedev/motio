// Records the published @remotion/starburst and @remotion/light-leaks in the pinned
// chrome-headless-shell, public API only (light-leaks-starburst-probe.tsx): the static markup of
// <Starburst> and <LightLeak> inside @remotion/player's <Thumbnail> for a grid of props and frames,
// the failures of invalid props (component and effect factory), what the effect factories return
// and the exported schemas. Pixels are recorded separately, as stills of fixtures/starburst and
// fixtures/light-leaks (record.ts --gl=swangle). Writes
// packages/starburst/src/__oracle__/starburst.json and
// packages/light-leaks/src/__oracle__/light-leaks.json. Run: pnpm record:light-leaks-starburst
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import type { ProbeSpec } from "./light-leaks-starburst-probe.tsx";

const here = import.meta.dirname;
const root = resolve(here, "../..");
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
const chrome =
	process.env.MOTIO_BROWSER_EXECUTABLE ??
	resolve(
		process.env.HOME ?? "",
		".cache/motio/browsers/chrome-headless-shell/mac_arm-158.0.8127.36/chrome-headless-shell-mac-arm64/chrome-headless-shell",
	);

/** Numbers JSON cannot hold and `undefined`, tagged so both sides can restore them. */
const tagged = (props: Record<string, unknown>) =>
	Object.fromEntries(
		Object.entries(props).map(([k, v]) => [
			k,
			typeof v === "number" && !Number.isFinite(v)
				? { $n: String(v) }
				: v === undefined
					? { $u: true }
					: v,
		]),
	);

const RB = ["#ff0000", "#0000ff"];

// <Starburst>
const starburstMarkup = [
	[{ rays: 4, colors: RB }, 0],
	[{ rays: 4, colors: RB, width: 200, height: 100 }, 0],
	[{ rays: 4, colors: RB, width: 200 }, 0],
	[{ rays: 4, colors: RB, height: 90 }, 0],
	[
		{
			rays: 4,
			colors: RB,
			width: 200,
			height: 100,
			style: { opacity: 0.5, left: 10 },
			className: "c",
			id: "x",
		},
		0,
	],
	[{ rays: 4, colors: RB, style: { width: 50 } }, 0],
	[{ rays: 4, colors: RB, from: 5 }, 2],
	[{ rays: 4, colors: RB, from: 5 }, 5],
	[{ rays: 4, colors: RB, from: 5, premountFor: 10 }, 2],
	[{ rays: 4, colors: RB, from: 5, premountFor: 10, styleWhilePremounted: { opacity: 0.3 } }, 2],
	[{ rays: 4, colors: RB, durationInFrames: 5 }, 4],
	[{ rays: 4, colors: RB, durationInFrames: 5 }, 5],
	[{ rays: 4, colors: RB, durationInFrames: 5, postmountFor: 5 }, 7],
	[{ rays: 4, colors: RB, hidden: true }, 0],
	[{ rays: 4, colors: RB, name: "Rays", showInTimeline: true }, 0],
	[{ rays: 4, colors: RB, trimBefore: 3, playbackRate: 2 }, 1],
	[{ rays: 4, colors: RB, layout: "none" }, 0],
	[{ rays: 4, colors: RB, vignette: 0.5, smoothness: 0.2, originOffsetX: 0.3 }, 0],
] as const;

const starburstInvalid: Array<Record<string, unknown>> = [
	{ rays: 1, colors: RB },
	{ rays: 101, colors: RB },
	{ rays: 2, colors: RB },
	{ rays: 100, colors: RB },
	{ rays: 2.5, colors: RB },
	{ rays: Number.NaN, colors: RB },
	{ rays: Number.POSITIVE_INFINITY, colors: RB },
	{ rays: "4", colors: RB },
	{ colors: RB },
	{},
	{ rays: 1 },
	{ rays: 4, colors: ["#ff0000"] },
	{ rays: 4 },
	{ rays: 4, colors: "red" },
	{ rays: 4, colors: [] },
	{ rays: 4, colors: ["red", "nope"] },
	{ rays: 4, colors: ["nope", 5] },
	{ rays: 4, colors: ["red", 5] },
	{ rays: 4, colors: ["red", "transparent", "rgba(0, 0, 255, 0.5)", "hsl(30, 80%, 50%)"] },
	{ rays: 4, colors: RB, rotation: Number.NaN },
	{ rays: 4, colors: RB, rotation: "10" },
	{ rays: 4, colors: RB, rotation: 720 },
	{ rays: 4, colors: RB, rotation: -30 },
	{ rays: 4, colors: RB, smoothness: 2 },
	{ rays: 4, colors: RB, smoothness: -0.1 },
	{ rays: 4, colors: RB, smoothness: Number.NaN },
	{ rays: 4, colors: RB, smoothness: "0.5" },
	{ rays: 4, colors: RB, vignette: 3 },
	{ rays: 4, colors: RB, vignette: -1 },
	{ rays: 4, colors: RB, vignette: Number.NaN },
	{ rays: 4, colors: RB, vignette: "1" },
	{ rays: 4, colors: RB, originOffsetX: 5, originOffsetY: -5 },
	{ rays: 4, colors: RB, originOffsetX: Number.NaN },
	{ rays: 4, colors: RB, originOffsetY: "0" },
	{ rays: 1, colors: ["#ff0000"], smoothness: 5 },
	{ rays: 4, colors: ["#ff0000"], smoothness: 5 },
	{ rays: 4, colors: RB, smoothness: 5, vignette: 5 },
	{ rays: 4, colors: RB, rotation: Number.NaN, smoothness: 5 },
	{ rays: 4, colors: RB, width: -10 },
	{ rays: 4, colors: RB, from: Number.NaN },
	{ rays: 4, colors: RB, durationInFrames: 0 },
];

const starburstFactory: Array<Record<string, unknown> | undefined> = [
	undefined,
	{ rays: 4, colors: RB },
	{ rays: 16, colors: ["#ffdd00", "#ff8800"], rotation: 15, smoothness: 0.1, origin: [0.2, 0.7] },
	{ rays: 4, colors: RB, disabled: true },
	{ rays: 4, colors: RB, vignette: 0.5, originOffsetX: 1 },
	{ rays: 4, colors: RB, origin: [2, -1] },
	{ rays: 4, colors: RB, origin: "center" },
	{ rays: 4, colors: RB, origin: [Number.NaN, 0] },
	{ rays: 4, colors: RB, disabled: "yes" },
	...starburstInvalid.filter((p) => !("vignette" in p) && !("width" in p) && !("from" in p)),
];

// <LightLeak>
const lightLeakMarkup = [
	[{}, 0],
	[{ durationInFrames: 30, seed: 2, hueShift: 120 }, 10],
	[{ durationInFrames: 30 }, 30],
	[{ width: 100 }, 0],
	[{ width: 100, height: 50, style: { opacity: 0.5 }, className: "c", id: "x" }, 0],
	[{ from: 5 }, 2],
	[{ from: 5, premountFor: 10 }, 2],
	[{ from: 5, durationInFrames: 10 }, 15],
	[{ from: 5, durationInFrames: 10, postmountFor: 5 }, 16],
	[{ hidden: true }, 0],
	[{ layout: "none" }, 0],
] as const;

const lightLeakInvalid: Array<Record<string, unknown>> = [
	{ seed: Number.NaN },
	{ seed: "x" },
	{ seed: -3.5 },
	{ seed: 1e9 },
	{ hueShift: 400 },
	{ hueShift: -1 },
	{ hueShift: 360 },
	{ hueShift: Number.NaN },
	{ hueShift: "90" },
	{ durationInFrames: 0 },
	{ durationInFrames: -1 },
	{ durationInFrames: 1 },
	{ durationInFrames: 2.5 },
	{ durationInFrames: Number.NaN },
	{ durationInFrames: Number.POSITIVE_INFINITY },
	{ durationInFrames: "30" },
	{ seed: Number.NaN, hueShift: 400 },
	{ hueShift: 400, durationInFrames: 0 },
	{ from: Number.NaN },
];

const lightLeakFactory: Array<Record<string, unknown> | undefined> = [
	undefined,
	{},
	{ seed: 3, hueShift: 30, progress: 0.25 },
	{ seed: 1.5 },
	{ disabled: true },
	{ progress: 0 },
	{ progress: 1 },
	{ progress: 2 },
	{ progress: -1 },
	{ progress: Number.NaN },
	{ progress: "0.5" },
	{ seed: Number.NaN },
	{ seed: "x" },
	{ hueShift: 400 },
	{ hueShift: -10 },
	{ hueShift: Number.NaN },
	{ durationInFrames: 30 },
	{ disabled: "yes" },
];

const spec: ProbeSpec = {
	starburst: {
		markup: starburstMarkup.map(([props, frame]) => ({ props: tagged(props), frame })),
		invalid: starburstInvalid.map(tagged),
		factory: starburstFactory.map((p) => (p ? tagged(p) : null)),
	},
	lightLeak: {
		markup: lightLeakMarkup.map(([props, frame]) => ({ props: tagged(props), frame })),
		invalid: lightLeakInvalid.map(tagged),
		factory: lightLeakFactory.map((p) => (p ? tagged(p) : null)),
	},
};

const js =
	(
		await build({
			stdin: {
				contents: `import { runProbe } from "./light-leaks-starburst-probe.tsx"; window.runProbe = runProbe;`,
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
const server = createServer((_req, res) => {
	res.writeHead(200, { "content-type": "text/html" }).end(html);
});
await new Promise<void>((done) => server.listen(0, done));
const address = server.address();
const origin = `http://localhost:${typeof address === "object" && address ? address.port : 0}`;

const browser = await puppeteer.launch({
	executablePath: chrome,
	headless: true,
	args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
let result: { starburst: Record<string, unknown>; lightLeak: Record<string, unknown> };
try {
	const page = await browser.newPage();
	await page.goto(`${origin}/`);
	result = (await page.evaluate(
		(s) => (window as unknown as { runProbe(spec: unknown): Promise<unknown> }).runProbe(s),
		spec as never,
	)) as typeof result;
} finally {
	await browser.close();
	server.close();
}

const write = (dir: string, file: string, data: Record<string, unknown>) => {
	const out = join(root, dir);
	mkdirSync(out, { recursive: true });
	writeFileSync(join(out, file), `${JSON.stringify(data)}\n`);
};

write("packages/starburst/src/__oracle__", "starburst.json", {
	package: "@remotion/starburst",
	version: pkg.dependencies["@remotion/starburst"],
	chrome: "158.0.8127.36",
	description:
		"<Starburst> in a 320x180, 60-frame Thumbnail: static markup per props and frame; failures of invalid props (rendered, caught by the Thumbnail's error fallback) and of starburst(); what starburst() returns (functions as function/<arity>); starburstEffectSchema",
	...result.starburst,
});
write("packages/light-leaks/src/__oracle__", "light-leaks.json", {
	package: "@remotion/light-leaks",
	version: pkg.dependencies["@remotion/light-leaks"],
	chrome: "158.0.8127.36",
	description:
		"<LightLeak> in a 320x180, 60-frame Thumbnail: static markup per props and frame; failures of invalid props (rendered, caught by the Thumbnail's error fallback) and of lightLeak(); what lightLeak() returns (functions as function/<arity>); lightLeakEffectSchema",
	...result.lightLeak,
});
console.log("starburst.json and light-leaks.json recorded");
