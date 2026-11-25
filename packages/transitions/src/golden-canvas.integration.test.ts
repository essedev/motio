// End-to-end proof of the HTML-in-canvas presentations: fixtures/transitions-canvas, written
// against @remotion/transitions, bundled with @motiojs/bundler (Remotion specifiers aliased to
// Motio) and rendered with @motiojs/renderer, matches the stills recorded from Remotion 4.0.545
// (fixtures/transitions-canvas/__golden__/remotion, recorded with --gl=swangle, the software WebGL
// Motio uses by default).
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBundle } from "@motiojs/bundler";
import { renderStill, selectComposition } from "@motiojs/renderer";
import {
	type Comparison,
	compareImages,
	decodeImage,
	MAX_BLOCK_DIFFERENCE,
} from "@motiojs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, "../../../fixtures/transitions-canvas");
const GOLDEN = join(FIXTURE, "__golden__/remotion");
const frames = JSON.parse(readFileSync(join(FIXTURE, "frames.json"), "utf8")) as Record<
	string,
	number[]
>;

// ROADMAP M1 thresholds.
const MEAN_SSIM = 0.99;
const MIN_PSNR_DB = 40;
const WORST_SSIM = 0.97;

const require = createRequire(import.meta.url);
const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`));
const DIST = resolve(here, "../dist/presentations");
const SUBPATHS = [
	"blur-slide",
	"book-flip",
	"cross-zoom",
	"crosswarp",
	"dissolve",
	"dreamy-zoom",
	"fade",
	"film-burn",
	"linear-blur",
	"ripple",
	"slide",
	"swap",
	"zoom-blur",
	"zoom-in-out",
];

// The fixture declares no dependencies, so every module it imports is aliased from here.
const aliases: Record<string, string> = {
	remotion: require.resolve("@motiojs/motio"),
	"@remotion/transitions": resolve(here, "../dist/index.js"),
	...Object.fromEntries(SUBPATHS.map((s) => [`@remotion/transitions/${s}`, join(DIST, `${s}.js`)])),
};

let outDir: string;
let serveUrl: string;
const scores: Array<{ id: string; frame: number } & Comparison> = [];

beforeAll(async () => {
	outDir = await mkdtemp(join(tmpdir(), "motio-transitions-canvas-golden-"));
	const bundle = await createBundle({
		entryPoint: "src/index.ts",
		rootDir: FIXTURE,
		outDir,
		compat: { aliases },
		viteOverride: (config) => ({
			...config,
			resolve: {
				...config.resolve,
				alias: [
					{ find: /^react$/, replacement: require.resolve("react") },
					{ find: /^react\/(.*)$/, replacement: `${packageDir("react")}/$1` },
					{ find: /^react-dom$/, replacement: require.resolve("react-dom") },
					{ find: /^react-dom\/(.*)$/, replacement: `${packageDir("react-dom")}/$1` },
				],
			},
		}),
	});
	serveUrl = bundle.serveUrl;
}, 120_000);

afterAll(async () => {
	if (outDir) await rm(outDir, { recursive: true, force: true });
	if (scores.length > 0) {
		const lines = scores.map(
			(s) => `${s.id} ${s.frame}: SSIM ${s.ssim.toFixed(5)}, PSNR ${s.psnr.toFixed(2)} dB`,
		);
		console.log(`HTML-in-canvas transitions against Remotion 4.0.545:\n${lines.join("\n")}`);
	}
});

describe("HTML-in-canvas presentations match Remotion's reference stills", () => {
	it("every frame of frames.json", async () => {
		for (const [id, list] of Object.entries(frames)) {
			const composition = await selectComposition({ serveUrl, id, inputProps: {} });
			for (const frame of list) {
				// Remotion's setting when recording (gl swangle, hence the GPU raster) and its GPU canvas.
				const { buffer } = await renderStill({
					serveUrl,
					composition,
					frame,
					imageFormat: "png",
					chromiumOptions: { gl: "swangle" },
					canvas: "gpu",
				});
				if (!buffer) throw new Error("renderStill returned no buffer");
				const ours = await decodeImage(buffer);
				const ref = await decodeImage(
					readFileSync(join(GOLDEN, id, `${String(frame).padStart(4, "0")}.png`)),
				);
				scores.push({ id, frame, ...compareImages("transitions-canvas", id, frame, ours, ref) });
			}
		}
		const failing = scores.filter(
			(s) => s.ssim < WORST_SSIM || s.psnr < MIN_PSNR_DB || s.block.max > MAX_BLOCK_DIFFERENCE,
		);
		expect(
			failing,
			"frames under the worst-frame SSIM or the PSNR threshold, or with a block over the block threshold",
		).toEqual([]);
		const mean = scores.reduce((sum, s) => sum + s.ssim, 0) / scores.length;
		expect(mean).toBeGreaterThanOrEqual(MEAN_SSIM);
	}, 600_000);
});
