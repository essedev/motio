// End-to-end proof of @motiojs/transitions: the Transitions composition of fixtures/features,
// written against @remotion/transitions, bundled with @motiojs/bundler (Remotion specifiers
// aliased to Motio) and rendered with @motiojs/renderer, matches the stills recorded from
// Remotion 4.0.545 (fixtures/features/__golden__/remotion/transitions).
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBundle } from "@motiojs/bundler";
import { renderStill, selectComposition } from "@motiojs/renderer";
import { decodeImage, psnr, ssim } from "@motiojs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, "../../../fixtures/features");
const GOLDEN = join(FIXTURE, "__golden__/remotion/transitions");
const frames = (
	JSON.parse(readFileSync(join(FIXTURE, "frames.json"), "utf8")) as Record<string, number[]>
).transitions as number[];

// ROADMAP M1 thresholds, applied to fixtures/features by M2.
const MEAN_SSIM = 0.99;
const MIN_PSNR_DB = 40;
const WORST_SSIM = 0.97;

const require = createRequire(import.meta.url);
const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`));
const DIST = resolve(here, "../dist/presentations");
const SUBPATHS = ["fade", "slide", "wipe", "flip", "clock-wipe", "iris", "cube", "none"];
const STUB = join(here, "testing/unrelated-features-stub.ts");

// The fixture declares no dependencies, so every module it imports is aliased from here.
const aliases: Record<string, string> = {
	remotion: require.resolve("motio"),
	"@remotion/transitions": resolve(here, "../dist/index.js"),
	...Object.fromEntries(SUBPATHS.map((s) => [`@remotion/transitions/${s}`, join(DIST, `${s}.js`)])),
	"@remotion/shapes": STUB,
	"@remotion/paths": STUB,
	"@remotion/noise": STUB,
};

let outDir: string;
let serveUrl: string;
const scores: Array<{ frame: number; ssim: number; psnr: number }> = [];

beforeAll(async () => {
	outDir = await mkdtemp(join(tmpdir(), "motio-transitions-golden-"));
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
});

afterAll(async () => {
	if (outDir) await rm(outDir, { recursive: true, force: true });
	if (scores.length > 0) {
		const lines = scores.map(
			(s) => `transitions ${s.frame}: SSIM ${s.ssim.toFixed(5)}, PSNR ${s.psnr.toFixed(2)} dB`,
		);
		console.log(`Transitions against Remotion 4.0.545:\n${lines.join("\n")}`);
	}
});

describe("transitions match Remotion's reference stills", () => {
	it(`frames ${frames.join(", ")}`, async () => {
		const composition = await selectComposition({ serveUrl, id: "transitions", inputProps: {} });
		expect(composition.durationInFrames).toBe(148);
		for (const frame of frames) {
			const { buffer } = await renderStill({ serveUrl, composition, frame, imageFormat: "png" });
			if (!buffer) throw new Error("renderStill returned no buffer");
			const ours = await decodeImage(buffer);
			const ref = await decodeImage(
				readFileSync(join(GOLDEN, `${String(frame).padStart(4, "0")}.png`)),
			);
			scores.push({ frame, ssim: ssim(ours, ref), psnr: psnr(ours, ref) });
		}
		const failing = scores.filter((s) => s.ssim < WORST_SSIM || s.psnr < MIN_PSNR_DB);
		expect(failing, "frames under the worst-frame SSIM or the PSNR threshold").toEqual([]);
		const mean = scores.reduce((sum, s) => sum + s.ssim, 0) / scores.length;
		expect(mean).toBeGreaterThanOrEqual(MEAN_SSIM);
	});
});
