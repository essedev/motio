// End-to-end check of @motiojs/light-leaks: fixtures/light-leaks, written against
// @remotion/light-leaks, bundled with @motiojs/bundler (Remotion specifiers aliased to Motio) and
// rendered with @motiojs/renderer, against the stills recorded from Remotion 4.0.545
// (fixtures/light-leaks/__golden__/remotion, --gl=swangle). Motio draws its own pattern
// (Remotion's shader is undocumented), so the M1 thresholds do not apply: the test checks the
// documented behaviour instead. Where Remotion's leak is transparent the stills are equal; at the
// peak both cover the canvas, with the same mean hue; while revealing and retracting both cover it
// in part. SSIM and PSNR are printed for the record.
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBundle } from "@motiojs/bundler";
import { renderStill, selectComposition } from "@motiojs/renderer";
import {
	compareImages,
	decodeImage,
	describeBlock,
	MAX_BLOCK_DIFFERENCE,
	psnr,
	type RgbaImage,
	ssim,
} from "@motiojs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, "../../../fixtures/light-leaks");
const GOLDEN = join(FIXTURE, "__golden__/remotion");
const SAME_PSNR_DB = 40;
const MAX_HUE_DIFFERENCE = 10;

const require = createRequire(import.meta.url);
const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`));

// The fixture declares no dependencies, so every module it imports is aliased from here.
const aliases: Record<string, string> = {
	remotion: require.resolve("@motiojs/motio"),
	"@remotion/light-leaks": resolve(here, "../dist/index.js"),
};

let outDir: string;
let serveUrl: string;
const scores: Array<{ id: string; frame: number; ssim: number; psnr: number }> = [];

beforeAll(async () => {
	outDir = await mkdtemp(join(tmpdir(), "motio-light-leaks-golden-"));
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
		console.log(`@motiojs/light-leaks against Remotion 4.0.545:\n${lines.join("\n")}`);
	}
});

/** Share of pixels lit by the leak: any channel above 40 (the backgrounds are black or flat). */
function coverage(image: RgbaImage, background: readonly number[] = [0, 0, 0]): number {
	let lit = 0;
	const { data } = image;
	for (let i = 0; i < data.length; i += 4) {
		const distance = Math.max(
			Math.abs((data[i] ?? 0) - (background[0] ?? 0)),
			Math.abs((data[i + 1] ?? 0) - (background[1] ?? 0)),
			Math.abs((data[i + 2] ?? 0) - (background[2] ?? 0)),
		);
		if (distance > 40) lit++;
	}
	return lit / (data.length / 4);
}

/** Hue in degrees of the mean color of the image. */
function meanHue(image: RgbaImage): number {
	let r = 0;
	let g = 0;
	let b = 0;
	const { data } = image;
	for (let i = 0; i < data.length; i += 4) {
		r += data[i] ?? 0;
		g += data[i + 1] ?? 0;
		b += data[i + 2] ?? 0;
	}
	const max = Math.max(r, g, b);
	const range = max - Math.min(r, g, b);
	if (range === 0) return 0;
	const sector =
		max === r ? (g - b) / range : max === g ? 2 + (b - r) / range : 4 + (r - g) / range;
	return (sector * 60 + 360) % 360;
}

const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

async function still(id: string, frame: number) {
	const composition = await selectComposition({ serveUrl, id, inputProps: {} });
	const { buffer } = await renderStill({ serveUrl, composition, frame, imageFormat: "png" });
	if (!buffer) throw new Error("renderStill returned no buffer");
	const ours = await decodeImage(buffer);
	const ref = await decodeImage(
		readFileSync(join(GOLDEN, id, `${String(frame).padStart(4, "0")}.png`)),
	);
	scores.push({ id, frame, ssim: ssim(ours, ref), psnr: psnr(ours, ref) });
	return { ours, ref };
}

describe("LightLeak behaves like Remotion's on its reference stills", () => {
	it("is transparent outside the leak, as in Remotion", async () => {
		for (const [id, frame] of [
			["light-leak-basic", 0],
			["light-leak-basic", 12],
			["light-leak-basic", 59],
			["light-leak-cut", 0],
		] as const) {
			const { ours, ref } = await still(id, frame);
			const { psnr: p, block } = compareImages("light-leaks", id, frame, ours, ref);
			expect(p, `${id} ${frame}`).toBeGreaterThanOrEqual(SAME_PSNR_DB);
			expect(block.max, `${id} ${frame}: ${describeBlock(block)}`).toBeLessThanOrEqual(
				MAX_BLOCK_DIFFERENCE,
			);
		}
	}, 120_000);

	it("covers the canvas at its peak with the same mean hue", async () => {
		for (const [id, frame] of [
			["light-leak-basic", 25],
			["light-leak-basic", 30],
			["light-leak-cut", 29],
			["light-leak-cut", 30],
		] as const) {
			const { ours, ref } = await still(id, frame);
			if (id === "light-leak-basic") {
				expect(coverage(ref), `${id} ${frame}`).toBeGreaterThan(0.99);
				expect(coverage(ours), `${id} ${frame}`).toBeGreaterThan(0.99);
			}
			expect(hueDistance(meanHue(ours), meanHue(ref)), `${id} ${frame}`).toBeLessThanOrEqual(
				MAX_HUE_DIFFERENCE,
			);
		}
	}, 120_000);

	it("covers it in part while revealing and retracting", async () => {
		for (const frame of [20, 40]) {
			const { ours, ref } = await still("light-leak-basic", frame);
			for (const image of [ours, ref]) {
				expect(coverage(image), `frame ${frame}`).toBeGreaterThan(0.3);
				expect(coverage(image), `frame ${frame}`).toBeLessThan(0.98);
			}
		}
	}, 120_000);
});
