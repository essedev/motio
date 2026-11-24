// End-to-end proof of @motiojs/rive: fixtures/rive, written against
// @remotion/rive, bundled with @motiojs/bundler (Remotion specifiers aliased to Motio) and
// rendered with @motiojs/renderer, matches the stills recorded from Remotion 4.0.545
// (fixtures/rive/__golden__/remotion). The Rive runtime's WebAssembly module comes from unpkg, as in
// Remotion (D-061), so this test needs the network..
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
const FIXTURE = resolve(here, "../../../fixtures/rive");
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

// The fixture declares no dependencies, so every module it imports is aliased from here.
const aliases: Record<string, string> = {
	remotion: require.resolve("@motiojs/motio"),
	"@remotion/rive": resolve(here, "../dist/index.js"),
};

let outDir: string;
let serveUrl: string;
const scores: Array<{ id: string; frame: number; ssim: number; psnr: number }> = [];

beforeAll(async () => {
	outDir = await mkdtemp(join(tmpdir(), "motio-rive-golden-"));
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
		console.log(`@motiojs/rive against Remotion 4.0.545:\n${lines.join("\n")}`);
	}
});

describe("RemotionRiveCanvas matches Remotion's reference stills", () => {
	it("every frame of frames.json", async () => {
		for (const [id, list] of Object.entries(frames)) {
			const composition = await selectComposition({ serveUrl, id, inputProps: {} });
			for (const frame of list) {
				const { buffer } = await renderStill({ serveUrl, composition, frame, imageFormat: "png" });
				if (!buffer) throw new Error("renderStill returned no buffer");
				const ours = await decodeImage(buffer);
				const ref = await decodeImage(
					readFileSync(join(GOLDEN, id, `${String(frame).padStart(4, "0")}.png`)),
				);
				scores.push({ id, frame, ssim: ssim(ours, ref), psnr: psnr(ours, ref) });
			}
		}
		const failing = scores.filter((s) => s.ssim < WORST_SSIM || s.psnr < MIN_PSNR_DB);
		expect(failing, "frames under the worst-frame SSIM or the PSNR threshold").toEqual([]);
		const mean = scores.reduce((sum, s) => sum + s.ssim, 0) / scores.length;
		expect(mean).toBeGreaterThanOrEqual(MEAN_SSIM);
	}, 180_000);
});
