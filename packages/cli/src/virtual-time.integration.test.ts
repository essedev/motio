// The virtual time model (ARCHITECTURE, "Time"): code that reads the clock instead of the frame (a
// GSAP-style timeline on requestAnimationFrame, a canvas loop integrating the time between
// animation frames, a setInterval counter, Date-based motion, Math.random) gives the decoded
// pixels of one ascending render on one page, whatever the order, the concurrency and where a
// render starts. Pages step through every frame from frame 0 and a page never goes back, so the
// state timers accumulate is the same on every page. The composition declares `timeModel="virtual"`,
// so these renders also check that the composition's default applies without the option.

import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBundle } from "@motiojs/bundler";
import { type RenderFramesOptions, renderFrames, selectComposition } from "@motiojs/renderer";
import { decodeImage, hashFrame } from "@motiojs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultDeps, runCli } from "./main.js";
import { testIo } from "./test-support/fakes.js";

const project = fileURLToPath(new URL("../test-fixtures/virtual-time/", import.meta.url));
const ID = "clock-driven";
let out: string;
let serveUrl: string;

beforeAll(async () => {
	out = await mkdtemp(join(tmpdir(), "motio-virtual-time-"));
	serveUrl = (
		await createBundle({
			entryPoint: "src/index.ts",
			rootDir: project,
			outDir: join(out, "bundle"),
		})
	).serveUrl;
}, 120_000);
afterAll(() => rm(out, { recursive: true, force: true }));

/** Deterministic Fisher-Yates shuffle. */
function shuffle(items: readonly number[], seed: number): number[] {
	const a = [...items];
	let s = seed;
	for (let i = a.length - 1; i > 0; i--) {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		const j = s % (i + 1);
		[a[i], a[j]] = [a[j] as number, a[i] as number];
	}
	return a;
}

/** Decoded RGBA hash of every frame one render produced. */
async function render(
	options: Partial<
		Pick<
			RenderFramesOptions,
			"concurrency" | "frameOrder" | "frameRange" | "recycleEveryNFrames" | "timeModel"
		>
	>,
): Promise<Map<number, string>> {
	const composition = await selectComposition({ serveUrl, id: ID });
	const images = new Map<number, Buffer>();
	await renderFrames({
		serveUrl,
		composition,
		outputDir: null,
		imageFormat: "png",
		onFrameBuffer: (buffer, frame) => void images.set(frame, buffer),
		...options,
	});
	const hashes = new Map<number, string>();
	for (const [frame, image] of images)
		hashes.set(frame, hashFrame((await decodeImage(image)).data));
	return hashes;
}

const high = (n: number) => Math.min(n, availableParallelism());

describe("virtual time model", () => {
	it("takes the composition's time model", async () => {
		const composition = await selectComposition({ serveUrl, id: ID });
		expect(composition.timeModel).toBe("virtual");
	});

	it("gives the frames of one ascending render in every order, concurrency and range", async () => {
		const reference = await render({ concurrency: 1 });
		expect(reference.size).toBe(60);
		// Every frame differs from the others: the panels move on every frame.
		expect(new Set(reference.values()).size).toBe(60);
		const runs: Record<string, Parameters<typeof render>[0]> = {
			"a new page per frame": { concurrency: 1, recycleEveryNFrames: 1 },
			"descending, concurrency 1": { concurrency: 1, frameOrder: (f) => [...f].reverse() },
			"random, concurrency 1": { concurrency: 1, frameOrder: (f) => shuffle(f, 7) },
			"ascending, concurrency 4": { concurrency: high(4) },
			"random, concurrency 4": { concurrency: high(4), frameOrder: (f) => shuffle(f, 11) },
			"ascending, concurrency 8": { concurrency: high(8) },
			"random, concurrency 8": { concurrency: high(8), frameOrder: (f) => shuffle(f, 13) },
			"frames 0 to 19": { concurrency: 1, frameRange: [0, 19] },
			"frames 20 to 39": { concurrency: 1, frameRange: [20, 39] },
			"frames 40 to 59": { concurrency: 1, frameRange: [40, 59] },
			"frames 25 to 59, concurrency 2": { concurrency: high(2), frameRange: [25, 59] },
			"frames 33 to 59, recycled every 7 frames": {
				concurrency: high(2),
				frameRange: [33, 59],
				recycleEveryNFrames: 7,
			},
		};
		const differing: Record<string, number[]> = {};
		for (const [name, options] of Object.entries(runs)) {
			const hashes = await render(options);
			differing[name] = [...hashes].flatMap(([f, h]) => (h === reference.get(f) ? [] : [f]));
		}
		expect(differing).toEqual(Object.fromEntries(Object.keys(runs).map((name) => [name, []])));
	}, 600_000);

	it("motio check determinism --reference fresh passes", async () => {
		const io = testIo(project);
		const code = await runCli(
			["check", "determinism", ID, "--frames=0-29", "--reference=fresh", "--json"],
			io,
			defaultDeps(process.env),
		);
		const result = JSON.parse(io.out.join("")) as Record<string, unknown>;
		expect(result).toMatchObject({ reference: "fresh", deterministic: true, mismatches: [] });
		expect(code).toBe(0);
	}, 300_000);
});

/** Decoded frames of a render of `id`, with the render's warning codes. */
async function renderDecoded(
	id: string,
	options: Partial<
		Pick<
			RenderFramesOptions,
			| "canvas"
			| "concurrency"
			| "frameOrder"
			| "frameRange"
			| "recycleEveryNFrames"
			| "timeModel"
			| "timeZone"
		>
	>,
) {
	const composition = await selectComposition({
		serveUrl,
		id,
		...(options.timeZone ? { timeZone: options.timeZone } : {}),
	});
	const images = new Map<number, Buffer>();
	const result = await renderFrames({
		serveUrl,
		composition,
		outputDir: null,
		imageFormat: "png",
		onFrameBuffer: (buffer, frame) => void images.set(frame, buffer),
		...options,
	});
	const frames = new Map<number, Awaited<ReturnType<typeof decodeImage>>>();
	for (const [frame, image] of images) frames.set(frame, await decodeImage(image));
	return { frames, warnings: result.warnings.map((w) => w.code) };
}

/** Column of the first white pixel on row `y`, the left edge of the box. */
function leftEdge(image: { data: Uint8Array; width: number }, y: number): number {
	let x = 0;
	while (x < image.width && (image.data[(y * image.width + x) * 4] as number) < 128) x++;
	return x;
}

/** Length of the white run that starts row `y`, the bar of the time-zone composition. */
function barWidth(image: { data: Uint8Array; width: number }, y: number): number {
	let x = 0;
	while (x < image.width && (image.data[(y * image.width + x) * 4] as number) >= 128) x++;
	return x;
}

describe("CSS transitions", () => {
	// The box jumps to x = 200 at frame 10, with a linear 1 s transition (30 frames).
	it("play from the frame that changed the style in the virtual time model, on every page", async () => {
		const ascending = await renderDecoded("css-transition", {
			timeModel: "virtual",
			concurrency: 1,
		});
		const edges = [...ascending.frames].map(([frame, image]) => [frame, leftEdge(image, 90)]);
		expect(edges).toEqual(
			edges.map(([frame]) => [
				frame,
				Math.round((200 * Math.min(30, Math.max(0, (frame as number) - 10))) / 30),
			]),
		);
		const hash = (frames: typeof ascending.frames) =>
			[...frames]
				.map(([frame, image]) => [frame, hashFrame(image.data)])
				.sort((a, b) => (a[0] as number) - (b[0] as number));
		for (const options of [
			{ concurrency: 1, recycleEveryNFrames: 1 },
			{ concurrency: high(4), frameOrder: (f: number[]) => shuffle(f, 5) },
		]) {
			const other = await renderDecoded("css-transition", { timeModel: "virtual", ...options });
			expect(hash(other.frames)).toEqual(hash(ascending.frames));
		}
	}, 300_000);

	it("show their end at once in the frame model, with a warning", async () => {
		const { frames, warnings } = await renderDecoded("css-transition", {
			concurrency: 1,
			frameRange: [8, 20],
		});
		for (const [frame, image] of frames) expect(leftEdge(image, 90)).toBe(frame >= 10 ? 200 : 0);
		expect(warnings).toContain("W_CSS_TRANSITION");
	}, 120_000);
});

describe("time zone", () => {
	it("is UTC on the page and in its workers unless the timeZone option names another", async () => {
		const utc = await selectComposition({ serveUrl, id: "time-zone" });
		expect(utc.props).toEqual({ zone: "UTC", hour: 12, workerZone: "UTC" });
		const tokyo = await selectComposition({ serveUrl, id: "time-zone", timeZone: "Asia/Tokyo" });
		expect(tokyo.props).toEqual({ zone: "Asia/Tokyo", hour: 21, workerZone: "Asia/Tokyo" });
		// Every page of a render, also pages sharing a browser.
		for (const [timeZone, width] of [
			[undefined, 120],
			["Asia/Tokyo", 210],
		] as const) {
			const { frames } = await renderDecoded("time-zone", {
				concurrency: high(4),
				...(timeZone ? { timeZone } : {}),
			});
			expect([...frames.values()].map((image) => barWidth(image, 5))).toEqual(
				[...frames.keys()].map(() => width),
			);
		}
	}, 120_000);
});

describe("a requestAnimationFrame loop in the frame model", () => {
	// The fixture's ticker and canvas loop call back as fast as Chrome draws (renders lift the
	// frame rate limit). Before the frame gate, a canvas drawn on the GPU made each screenshot
	// wait about 10 s for its frame.
	it("is held while frames are captured, and reported", async () => {
		const { frames, warnings } = await renderDecoded("clock-driven", {
			timeModel: "frame",
			canvas: "gpu",
			concurrency: 1,
			frameRange: [0, 9],
		});
		expect(frames.size).toBe(10);
		expect(warnings).toEqual(expect.arrayContaining(["W_ANIMATION_FRAME_LOOP", "W_MATH_RANDOM"]));
	}, 60_000);

	it("makes check determinism suggest the virtual time model", async () => {
		const io = testIo(project);
		const code = await runCli(
			["check", "determinism", ID, "--frames=0-9", "--time-model=frame", "--json"],
			io,
			defaultDeps(process.env),
		);
		const result = JSON.parse(io.out.join("")) as Record<string, unknown>;
		expect(result).toMatchObject({
			deterministic: false,
			diagnosis: {
				timeModel: {
					suggested: "virtual",
					evidence: expect.arrayContaining(["W_ANIMATION_FRAME_LOOP", "W_MATH_RANDOM"]),
				},
			},
		});
		expect(code).toBe(3);
	}, 300_000);
});

describe("a timer loop", () => {
	// A setTimeout(0) chain moves a box and redraws a canvas, an interval updates React state.
	// Before the frame gate observed timers, the box's DOM changes kept every frame from
	// settling in the frame model (E_SEEK_TIMEOUT after 35 s); a 0 ms chain also ran forever at
	// one instant in the virtual model.
	it("settles and is reported in the frame model", async () => {
		const { frames, warnings } = await renderDecoded("timer-loop", {
			timeModel: "frame",
			concurrency: 1,
			frameRange: [0, 9],
		});
		expect(frames.size).toBe(10);
		expect(warnings).toContain("W_TIMER_LOOP");
	}, 60_000);

	it("advances 4 ms per nested call in the virtual model, the same on every page", async () => {
		const hashes = async (options: Parameters<typeof renderDecoded>[1]) => {
			const { frames } = await renderDecoded("timer-loop", {
				timeModel: "virtual",
				frameRange: [0, 19],
				...options,
			});
			return [...frames]
				.map(([frame, image]) => [frame, hashFrame(image.data)] as const)
				.sort((a, b) => a[0] - b[0]);
		};
		const ascending = await hashes({ concurrency: 1 });
		expect(new Set(ascending.map(([, hash]) => hash)).size).toBeGreaterThan(10);
		expect(await hashes({ concurrency: 1, recycleEveryNFrames: 1 })).toEqual(ascending);
	}, 120_000);
});

describe("locale", () => {
	it("is en-US in the page, its workers and its requests unless the locale option names another", async () => {
		const server = createServer((req, res) => {
			res.setHeader("access-control-allow-origin", "*");
			res.end(req.headers["accept-language"] ?? "");
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const echoUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
		try {
			const read = async (locale?: string) => {
				const { props } = await selectComposition({
					serveUrl,
					id: "locale",
					inputProps: { echoUrl },
					...(locale ? { locale } : {}),
				});
				const { echoUrl: _, ...rest } = props;
				return rest;
			};
			expect(await read()).toEqual({
				language: "en-US",
				languages: ["en-US"],
				intl: "en-US",
				number: "1,234.5",
				workerLanguage: "en-US",
				workerIntl: "en-US",
				acceptLanguage: "en-US",
			});
			expect(await read("de-CH")).toEqual({
				language: "de-CH",
				languages: ["de-CH"],
				intl: "de-CH",
				number: "1'234.5",
				workerLanguage: "de-CH",
				workerIntl: "de-CH",
				acceptLanguage: "de-CH",
			});
		} finally {
			server.close();
		}
	}, 120_000);
});
