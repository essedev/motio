// The `raster` and `canvas` options against the browser itself: what Chrome reports it uses for
// each combination (SystemInfo.getInfo), and that the options of a render reach the browser it
// launches, including `gl: "swangle"` switching to the GPU raster.
import { afterAll, describe, expect, it } from "vitest";
import { ensureBrowser } from "./browser/ensure.js";
import type { CanvasMode, RasterMode } from "./browser/flags.js";
import { type LaunchOptions, launchBrowser } from "./browser/launch.js";
import { openBrowser, renderStill, selectComposition } from "./index.js";
import { childPids, commandLine, fixturePageDir } from "./test-support/fixture-page.js";

const serveUrl = fixturePageDir();
const opened: Array<{ close(options: { silent: boolean }): Promise<void> }> = [];
afterAll(async () => {
	await Promise.all(opened.map((b) => b.close({ silent: true })));
});

/** Chrome's feature status for 2D canvas, rasterisation and compositing. */
async function featureStatus(launch: Omit<LaunchOptions, "executablePath" | "width" | "height">) {
	const { executablePath } = await ensureBrowser();
	const browser = await launchBrowser({ executablePath, width: 64, height: 64, ...launch });
	try {
		const cdp = await browser.target().createCDPSession();
		const info = (await cdp.send("SystemInfo.getInfo")) as {
			gpu: { featureStatus: Record<string, string> };
		};
		const status = info.gpu.featureStatus;
		return {
			canvas: status["2d_canvas"],
			raster: status.rasterization,
			compositing: status.gpu_compositing,
		};
	} finally {
		await browser.close();
	}
}

describe("what Chrome uses for each raster and canvas mode (software GL)", () => {
	const cases: Array<{
		transparent: boolean;
		raster?: RasterMode;
		canvas?: CanvasMode;
		expected: { canvas: string; raster: string; compositing: string };
	}> = [
		// Opaque captures composite in software, which also rasterises on the CPU; Chrome still
		// lists GPU rasterisation as available, but a software compositor never uses it.
		{
			transparent: false,
			expected: { canvas: "enabled", raster: "enabled", compositing: "disabled_software" },
		},
		{
			transparent: true,
			expected: {
				canvas: "disabled_software",
				raster: "disabled_software",
				compositing: "enabled",
			},
		},
		{
			transparent: true,
			canvas: "gpu",
			expected: { canvas: "enabled", raster: "disabled_software", compositing: "enabled" },
		},
		{
			transparent: true,
			raster: "gpu",
			expected: { canvas: "disabled_software", raster: "enabled", compositing: "enabled" },
		},
		{
			transparent: false,
			raster: "gpu",
			canvas: "gpu",
			expected: { canvas: "enabled", raster: "enabled", compositing: "enabled" },
		},
	];
	for (const c of cases) {
		const name = `${c.transparent ? "transparent" : "opaque"}, raster ${c.raster ?? "default"}, canvas ${c.canvas ?? "default"}`;
		it(name, async () => {
			const status = await featureStatus({
				transparent: c.transparent,
				raster: c.raster ?? null,
				canvas: c.canvas ?? null,
			});
			expect(status).toEqual(c.expected);
		});
	}
});

describe("the options of a render reach the browser", () => {
	/** Command lines of the browsers this process runs (the main process of each). */
	const browserLines = () =>
		childPids()
			.map(commandLine)
			.filter((line) => line.includes("chrome-headless-shell") && !line.includes("--type="));

	async function renderTransparent(
		options: { raster?: RasterMode; canvas?: CanvasMode },
		gl?: "swangle",
	) {
		const puppeteerInstance = await openBrowser("chrome", gl ? { chromiumOptions: { gl } } : {});
		opened.push(puppeteerInstance);
		const before = new Set(browserLines());
		const composition = await selectComposition({ serveUrl, id: "stamp", puppeteerInstance });
		await renderStill({
			serveUrl,
			composition,
			frame: 3,
			imageFormat: "png",
			puppeteerInstance,
			...options,
		});
		const after = browserLines();
		await puppeteerInstance.close();
		// With the CPU raster the transparent capture launches its own browser on the shared pool;
		// with the GPU raster opaque and transparent captures launch alike and share one.
		const launched = after.filter((line) => !before.has(line));
		return launched.length === 1 ? (launched[0] as string) : after.join("\n");
	}

	it("draws canvases in software and rasterises on the CPU by default", async () => {
		const line = await renderTransparent({});
		expect(line).toContain("--disable-gpu-rasterization");
		expect(line).toContain("--disable-accelerated-2d-canvas");
	});

	it("passes raster gpu and canvas gpu", async () => {
		const line = await renderTransparent({ raster: "gpu", canvas: "gpu" });
		expect(line).not.toContain("--disable-gpu-rasterization");
		expect(line).not.toContain("--disable-accelerated-2d-canvas");
	});

	it("rasterises on the GPU with gl swangle, unless raster is given", async () => {
		// Opaque captures too: the browser openBrowser started serves the transparent one.
		const swangle = await renderTransparent({}, "swangle");
		expect(swangle).not.toContain("--disable-gpu-rasterization");
		expect(swangle).not.toContain("--disable-gpu-compositing");
		expect(await renderTransparent({ raster: "cpu" }, "swangle")).toContain(
			"--disable-gpu-rasterization",
		);
	});

	it("rejects unknown values", async () => {
		const composition = await selectComposition({ serveUrl, id: "stamp" });
		await expect(
			renderStill({
				serveUrl,
				composition,
				frame: 0,
				raster: "metal" as RasterMode,
			}),
		).rejects.toMatchObject({ code: "E_INVALID_OPTION", details: { option: "raster" } });
		await expect(
			renderStill({
				serveUrl,
				composition,
				frame: 0,
				canvas: "hardware" as CanvasMode,
			}),
		).rejects.toMatchObject({ code: "E_INVALID_OPTION", details: { option: "canvas" } });
	});
});
