import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "@motiojs/core/protocol";
import { afterAll, describe, expect, it } from "vitest";
import {
	type BrowserLog,
	getCompositions,
	MotioError,
	makeCancelSignal,
	renderMedia,
	selectComposition,
} from "./index.js";
import { childPids, fixturePageDir } from "./test-support/fixture-page.js";
import { hangingFfmpeg } from "./test-support/hanging-ffmpeg.js";

const serveUrl = fixturePageDir();
const dir = mkdtempSync(join(tmpdir(), "motio-errors-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function rejection(p: Promise<unknown>): Promise<MotioError> {
	try {
		await p;
	} catch (err) {
		if (err instanceof MotioError) return err;
		throw err;
	}
	throw new Error("expected a rejection");
}

describe("errors", () => {
	it("reports a readiness timeout with its code, label and frame", async () => {
		const composition = await selectComposition({ serveUrl, id: "hang" });
		const t = performance.now();
		const err = await rejection(
			renderMedia({
				serveUrl,
				composition,
				codec: "h264",
				concurrency: 1,
				timeoutInMilliseconds: 1500,
				outputLocation: join(dir, "hang.mp4"),
			}),
		);
		expect(err.code).toBe("E_READINESS_TIMEOUT");
		expect(err.label).toBe("fixture: waiting for data that never arrives");
		expect(err.frame).toBe(2);
		expect(err.composition).toBe("hang");
		expect(err.message).toContain("fixture: waiting for data that never arrives");
		expect(err.message).toContain("frame 2");
		// The page's own timeout fires, well before the Node watchdog.
		expect(performance.now() - t).toBeLessThan(15_000);
		expect(existsSync(join(dir, "hang.mp4"))).toBe(false);
	}, 60_000);

	it("surfaces an error thrown by the composition", async () => {
		const composition = await selectComposition({ serveUrl, id: "throws" });
		const err = await rejection(
			renderMedia({
				serveUrl,
				composition,
				codec: "h264",
				concurrency: 2,
				outputLocation: join(dir, "t.mp4"),
			}),
		);
		expect(err.code).toBe("E_RENDER_ERROR");
		expect(err.message).toMatch(/fixture: boom at frame \d+/);
		expect(err.frame).toBeGreaterThanOrEqual(3);
		expect(err.pageStack).toContain("ThrowScene");
	}, 60_000);

	it("forwards console output and fails on an uncaught page error", async () => {
		const composition = await selectComposition({ serveUrl, id: "uncaught" });
		const logs: BrowserLog[] = [];
		const err = await rejection(
			renderMedia({
				serveUrl,
				composition,
				codec: "h264",
				concurrency: 1,
				outputLocation: join(dir, "u.mp4"),
				onBrowserLog: (l) => logs.push(l),
			}),
		);
		expect(err.code).toBe("E_PAGE_ERROR");
		expect(err.message).toContain("fixture: uncaught in a timer");
		expect(logs).toContainEqual(
			expect.objectContaining({ type: "log", text: "fixture: rendered frame 0" }),
		);
		expect(logs).toContainEqual(
			expect.objectContaining({
				type: "error",
				text: expect.stringContaining("fixture: uncaught in a timer"),
			}),
		);
	}, 60_000);

	it("refuses a bundle speaking another protocol version, naming both", async () => {
		const err = await rejection(
			getCompositions({ serveUrl, inputProps: { __fixtureProtocol: 999 } }),
		);
		expect(err.code).toBe("E_PROTOCOL_MISMATCH");
		expect(err.message).toContain("protocol 999");
		expect(err.message).toContain(`speaks protocol ${PROTOCOL_VERSION}`);
	}, 60_000);

	it("names the available compositions for an unknown id", async () => {
		const err = await rejection(selectComposition({ serveUrl, id: "nope" }));
		expect(err.code).toBe("E_COMPOSITION_NOT_FOUND");
		expect(err.message).toContain('"stamp"');
	}, 60_000);

	it("rejects av1, the one codec Motio does not encode (D-037)", async () => {
		const composition = await selectComposition({ serveUrl, id: "stamp" });
		await expect(renderMedia({ serveUrl, composition, codec: "av1" })).rejects.toMatchObject({
			code: "E_UNSUPPORTED_CODEC",
		});
	}, 60_000);

	it("stops a render on cancel and cleans up processes and partial output", async () => {
		const composition = await selectComposition({
			serveUrl,
			id: "stamp",
			inputProps: { durationInFrames: 3000 },
		});
		const before = new Set(childPids());
		const { cancelSignal, cancel } = makeCancelSignal();
		let peak = 0;
		const out = join(dir, "cancelled.mp4");
		const err = await rejection(
			renderMedia({
				serveUrl,
				composition,
				codec: "h264",
				concurrency: 4,
				outputLocation: out,
				cancelSignal,
				onProgress: (p) => {
					peak = Math.max(peak, childPids().filter((pid) => !before.has(pid)).length);
					if (p.renderedFrames >= 40) cancel();
				},
			}),
		);
		expect(err.code).toBe("E_CANCELLED");
		expect(err.message).toBe("renderMedia() got cancelled");
		// Two browsers (four pages, D-042) and FFmpeg were running.
		expect(peak).toBeGreaterThanOrEqual(3);
		expect(childPids().filter((pid) => !before.has(pid))).toEqual([]);
		expect(existsSync(out)).toBe(false);
		expect(readdirSync(dir).filter((f) => f.includes("cancelled"))).toEqual([]);
	}, 60_000);

	it("stops a GIF render cancelled during its palette pass", async () => {
		const composition = await selectComposition({ serveUrl, id: "stamp" });
		const before = new Set(childPids());
		const { cancelSignal, cancel } = makeCancelSignal();
		const { ffmpeg, hanging } = hangingFfmpeg(dir, "palettegen");
		let cancelledAt = 0;
		void hanging.then(() => {
			cancelledAt = performance.now();
			cancel();
		});
		const err = await rejection(
			renderMedia({
				serveUrl,
				composition,
				codec: "gif",
				frameRange: [0, 9],
				outputLocation: join(dir, "cancelled-palette.gif"),
				ffmpegExecutable: ffmpeg,
				cancelSignal,
			}),
		);
		expect(cancelledAt).toBeGreaterThan(0);
		expect(err.code).toBe("E_CANCELLED");
		// The palette pass hangs for 60 s unless the cancel kills it.
		expect(performance.now() - cancelledAt).toBeLessThan(10_000);
		expect(childPids().filter((pid) => !before.has(pid))).toEqual([]);
	}, 60_000);
});
