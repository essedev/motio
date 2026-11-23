import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeFrameStamp, decodeImage, type FrameStampOptions } from "@motiojs/testing";
import { afterAll, describe, expect, it } from "vitest";
import {
	getCompositions,
	openBrowser,
	renderFrames,
	renderMedia,
	renderStill,
	selectComposition,
} from "./index.js";
import { childPids, commandLine, fixturePageDir } from "./test-support/fixture-page.js";
import { stampMismatches } from "./test-support/video-checks.js";

const serveUrl = fixturePageDir();
const dir = mkdtempSync(join(tmpdir(), "motio-open-browser-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Browser processes this test process started. */
function browserPids(): number[] {
	return childPids().filter((pid) => commandLine(pid).includes("chrome-headless-shell"));
}

/** Waits until no browser process of this test process is left. */
async function noBrowsersLeft(): Promise<number[]> {
	for (let i = 0; i < 50 && browserPids().length > 0; i++) {
		await new Promise((ok) => setTimeout(ok, 100));
	}
	return browserPids();
}

describe("openBrowser", () => {
	it("serves every function from the same browser processes until close()", async () => {
		const puppeteerInstance = await openBrowser("chrome");
		try {
			const started = browserPids();
			expect(started).toHaveLength(1);

			const list = await getCompositions({ serveUrl, puppeteerInstance });
			expect(list.map((c) => c.id)).toContain("stamp");
			const composition = await selectComposition({
				serveUrl,
				id: "stamp",
				inputProps: { durationInFrames: 40 },
				puppeteerInstance,
			});
			const stamp = composition.props.stamp as FrameStampOptions;
			expect(browserPids()).toEqual(started);

			// Opaque capture: the browser opened by openBrowser(), at two output sizes.
			for (const [frame, scale] of [
				[7, 1],
				[23, 2],
			] as const) {
				const jpeg = await renderStill({
					serveUrl,
					composition,
					frame,
					scale,
					imageFormat: "jpeg",
					jpegQuality: 100,
					puppeteerInstance,
				});
				const img = await decodeImage(jpeg.buffer as Buffer);
				expect(img.width).toBe(512 * scale);
				const scaled = {
					x: stamp.x * scale,
					y: stamp.y * scale,
					blockSize: stamp.blockSize * scale,
				};
				expect(decodeFrameStamp(img.data, img.width, img.height, scaled)).toEqual({
					ok: true,
					frame,
				});
			}
			expect(browserPids()).toEqual(started);

			// A transparent capture composites differently (D-041): one more browser, kept.
			const png = await renderStill({ serveUrl, composition, frame: 11, puppeteerInstance });
			const p = await decodeImage(png.buffer as Buffer);
			expect(decodeFrameStamp(p.data, p.width, p.height, stamp)).toEqual({ ok: true, frame: 11 });
			const withTransparent = browserPids();
			expect(withTransparent).toHaveLength(2);
			expect(withTransparent).toEqual(expect.arrayContaining(started));

			// Four pages spread over two browsers (D-042): the first video adds the second, the next
			// ones reuse both.
			const out = join(dir, "shared.mp4");
			await renderMedia({
				serveUrl,
				composition,
				codec: "h264",
				concurrency: 4,
				outputLocation: out,
				puppeteerInstance,
			});
			const afterVideo = browserPids();
			expect(afterVideo).toHaveLength(3);
			for (let i = 0; i < 2; i++) {
				await renderMedia({
					serveUrl,
					composition,
					codec: "h264",
					concurrency: 4,
					outputLocation: out,
					puppeteerInstance,
				});
			}
			expect(browserPids()).toEqual(afterVideo);
			const { frames, mismatches } = await stampMismatches(out, (i) => i, stamp);
			expect([frames, mismatches]).toEqual([40, []]);

			const sequence = join(dir, "frames");
			await renderFrames({
				serveUrl,
				composition,
				outputDir: sequence,
				frameRange: [0, 4],
				imageFormat: "jpeg",
				onFrameUpdate: () => {},
				puppeteerInstance,
			});
			expect(readdirSync(sequence)).toHaveLength(5);
			expect(browserPids()).toEqual(afterVideo);
		} finally {
			await puppeteerInstance.close();
		}
		expect(puppeteerInstance.closed).toBe(true);
		expect(await noBrowsersLeft()).toEqual([]);
	});

	it("replaces a browser that crashed between renders", async () => {
		const puppeteerInstance = await openBrowser("chrome");
		try {
			const composition = await selectComposition({ serveUrl, id: "stamp", puppeteerInstance });
			const [first] = browserPids();
			expect(first).toBeDefined();
			process.kill(first as number, "SIGKILL");
			// The killed process turns into a zombie at once, which `ps` no longer reports as the
			// browser, so the render below usually starts before Puppeteer has seen the connection
			// close: the pool hands out the dead browser and opening the tab must recover from it.
			for (let i = 0; i < 50 && browserPids().includes(first as number); i++) {
				await new Promise((ok) => setTimeout(ok, 50));
			}
			const res = await renderStill({
				serveUrl,
				composition,
				imageFormat: "jpeg",
				puppeteerInstance,
			});
			expect(res.buffer?.length).toBeGreaterThan(0);
			expect(browserPids()).not.toContain(first);
			expect(browserPids()).toHaveLength(1);
		} finally {
			await puppeteerInstance.close();
		}
		expect(await noBrowsersLeft()).toEqual([]);
	});

	it("refuses foreign and closed instances, and closing twice unless silent", async () => {
		await expect(
			getCompositions({ serveUrl, puppeteerInstance: { closed: false, close: async () => {} } }),
		).rejects.toMatchObject({ code: "E_INVALID_OPTION" });
		await expect(openBrowser("firefox" as "chrome")).rejects.toMatchObject({
			code: "E_INVALID_OPTION",
		});
		await expect(openBrowser("chrome", { chromeMode: "chrome-for-testing" })).rejects.toMatchObject(
			{ code: "E_INVALID_OPTION" },
		);
		const puppeteerInstance = await openBrowser("chrome");
		await puppeteerInstance.close();
		await expect(getCompositions({ serveUrl, puppeteerInstance })).rejects.toMatchObject({
			code: "E_BROWSER_CLOSED",
		});
		await expect(puppeteerInstance.close()).rejects.toMatchObject({ code: "E_BROWSER_CLOSED" });
		await expect(puppeteerInstance.close({ silent: true })).resolves.toBeUndefined();
		expect(await noBrowsersLeft()).toEqual([]);
	});

	it("fails with E_BROWSER_LAUNCH for a browser that does not start", async () => {
		await expect(
			openBrowser("chrome", { browserExecutable: join(dir, "no-such-browser") }),
		).rejects.toMatchObject({ code: "E_BROWSER_LAUNCH" });
	});
});
