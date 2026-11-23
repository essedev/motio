// <RemotionRiveCanvas> against the published @remotion/rive in the pinned Chrome: the probe that
// recorded __oracle__/rive.json (tools/oracle-render/rive-probe.tsx) runs again with its imports
// aliased to Motio, over the same cases. Compared: the animation time at every frame, the canvas
// markup, the canvas pixels (hashes), the ref, onLoad, which props fail and how, and the URLs the
// page requests. Needs the network: the runtime's WebAssembly module comes from unpkg (D-061).
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { compareFailure } from "@motiojs/testing/oracle-errors";
import { build } from "esbuild";
import puppeteer, { type Browser } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testChromeArgs } from "../../testing/src/browser.js";
import oracle from "./__oracle__/rive.json" with { type: "json" };

const here = import.meta.dirname;
const root = resolve(here, "../../..");
const assets = join(root, "fixtures/rive/public");
const require = createRequire(import.meta.url);
const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`));
const chrome =
	process.env.MOTIO_BROWSER_EXECUTABLE ??
	resolve(
		process.env.HOME ?? "",
		".cache/motio/browsers/chrome-headless-shell/mac_arm-158.0.8127.36/chrome-headless-shell-mac-arm64/chrome-headless-shell",
	);

type Row = { time: number | null; didLoop: boolean } | null;
type TimingCase = { src: string; fps: number; props: Record<string, unknown>; frames: number[] };
type Result = {
	timing: Array<TimingCase & { rows: Row[] }>;
	markup: Array<Record<string, unknown> & { props: Record<string, unknown> }>;
	invalid: Array<{
		src?: string;
		props: Record<string, unknown>;
		loads: number;
		error: { name: string; message: string } | null;
		unhandled: unknown[];
	}>;
};

let server: Server;
let browser: Browser;
let motio: Result;
const external: string[] = [];

beforeAll(async () => {
	const js =
		(
			await build({
				stdin: {
					contents: `import { runRiveProbe } from "./rive-probe.tsx"; window.runRiveProbe = runRiveProbe;`,
					resolveDir: join(root, "tools/oracle-render"),
					loader: "ts",
				},
				bundle: true,
				write: false,
				format: "iife",
				platform: "browser",
				jsx: "automatic",
				define: { "process.env.NODE_ENV": '"production"' },
				alias: {
					"@remotion/rive": resolve(here, "../dist/index.js"),
					"@remotion/player": require.resolve("@motiojs/player"),
					react: packageDir("react"),
					"react-dom": packageDir("react-dom"),
				},
			})
		).outputFiles[0]?.text ?? "";
	const html = `<!doctype html><html><body style="margin:0"><script>${js}</script></body></html>`;
	server = createServer((req, res) => {
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
	browser = await puppeteer.launch({
		executablePath: chrome,
		headless: true,
		args: testChromeArgs(),
	});
	const page = await browser.newPage();
	page.on("request", (request) => {
		if (!request.url().startsWith(origin)) external.push(request.url());
	});
	await page.goto(`${origin}/`);
	const spec = {
		timing: oracle.timing.map(({ src, fps, props, frames }) => ({ src, fps, props, frames })),
		markup: oracle.markup.map((m) => {
			const { src, props, frame } = m as { src: string; props: unknown; frame?: number };
			return frame === undefined ? { src, props } : { src, props, frame };
		}),
		invalid: oracle.invalid.map((c) => {
			const { src, props } = c as { src?: string; props: unknown };
			return src === undefined ? { props } : { src, props };
		}),
	};
	motio = (await page.evaluate(
		(s) => (window as unknown as { runRiveProbe(spec: unknown): Promise<unknown> }).runRiveProbe(s),
		spec as never,
	)) as Result;
}, 300_000);

afterAll(async () => {
	await browser?.close();
	server?.close();
});

const label = (c: { src?: string; props: Record<string, unknown>; fps?: number }) =>
	`${c.src} ${c.fps ?? 30} fps ${JSON.stringify(c.props)}`;

const ascending = (frames: number[]) => frames.every((f, i) => i === 0 || f > (frames[i - 1] ?? 0));

/** Seconds of one loop of truck.riv's looping animations ("idle", "curves" in its work area). */
const LOOP_SPANS = [2, (198 - 77) / 60];

/**
 * Same pose: equal times, or the two ends of a looping animation (the published package lands on
 * the end of the loop where seeking from the start lands on its start).
 */
const samePose = (a: number | null, b: number | null) =>
	a === b ||
	(a !== null &&
		b !== null &&
		(Math.abs(a - b) < 1e-5 || LOOP_SPANS.some((span) => Math.abs(Math.abs(a - b) - span) < 1e-5)));

describe("RemotionRiveCanvas matches @remotion/rive", () => {
	it("downloads the runtime's WebAssembly module from the same URL", () => {
		expect([...new Set(external)]).toEqual(oracle.externalRequests);
	});

	it("seeks the animation to the recorded time at every frame drawn in order", () => {
		let compared = 0;
		for (const [i, recorded] of oracle.timing.entries()) {
			if (!ascending(recorded.frames)) continue;
			const rows = motio.timing[i]?.rows ?? [];
			recorded.rows.forEach((row: Row, j: number) => {
				const mine = rows[j] ?? null;
				const at = `${label(recorded)} frame ${recorded.frames[j]}`;
				expect(mine === null, at).toBe(row === null);
				if (row && mine)
					expect(samePose(mine.time, row.time), `${at}: ${mine.time} vs ${row.time}`).toBe(true);
				compared++;
			});
		}
		expect(compared).toBeGreaterThan(2000);
	});

	it("shows the same time at a frame whatever was drawn before it", () => {
		// Out of order, the published package advances by the difference from the previous frame,
		// so an animation that plays once ends up elsewhere (recorded); Motio seeks from the start
		// and shows what an in-order render shows at that frame (D-061).
		for (const [i, recorded] of oracle.timing.entries()) {
			if (ascending(recorded.frames)) continue;
			const inOrder = oracle.timing.find(
				(t) =>
					ascending(t.frames) &&
					t.fps === recorded.fps &&
					t.src === recorded.src &&
					JSON.stringify(t.props) ===
						JSON.stringify(
							recorded.props.animation === "bounce" ? {} : { animation: recorded.props.animation },
						),
			);
			const reference =
				inOrder ??
				(recorded.props.animation === "curves"
					? oracle.timing.find((t) => t.fps === 30 && t.props.animation === 2)
					: undefined);
			expect(reference, label(recorded)).toBeDefined();
			recorded.frames.forEach((frame: number, j: number) => {
				const expected = reference?.rows[reference.frames.indexOf(frame)]?.time ?? null;
				const mine = motio.timing[i]?.rows[j]?.time ?? null;
				expect(
					samePose(mine, expected),
					`${label(recorded)} frame ${frame}: ${mine} vs ${expected}`,
				).toBe(true);
			});
		}
	});

	it("draws the same canvas: markup, pixels, ref and onLoad", () => {
		for (const [i, recorded] of oracle.markup.entries()) {
			const mine = motio.markup[i] as Record<string, unknown>;
			const at = label(recorded as never);
			expect(mine.html, at).toBe(recorded.html);
			expect(mine.pixels, at).toBe(recorded.pixels);
			expect(mine.ref, at).toEqual(recorded.ref);
			expect(mine.loads, at).toBe(recorded.loads);
			expect(mine.fileArtboards, at).toBe(recorded.fileArtboards);
		}
	});

	it("fails for the same props, with the same error class", () => {
		for (const [i, recorded] of oracle.invalid.entries()) {
			const mine = motio.invalid[i];
			const at = label(recorded as never);
			const effects = Array.isArray(recorded.props.effects) && recorded.props.effects.length > 0;
			if (effects) {
				// Effects need @remotion/effects, which Motio does not provide: any effect throws.
				expect(mine?.error?.message, at).toMatch(/effects/);
				continue;
			}
			if (recorded.error === null) {
				expect(mine?.error, at).toBeNull();
				expect(mine?.loads, at).toBe(recorded.loads);
				continue;
			}
			expect(mine?.error, at).not.toBeNull();
			expect(
				compareFailure(
					mine?.error,
					{ error: recorded.error.message, errorType: recorded.error.name },
					["fit", "alignment", "playbackRate"],
				),
				at,
			).toBeUndefined();
			expect(mine?.loads, at).toBe(recorded.loads);
			expect(mine?.unhandled, at).toEqual(recorded.unhandled);
		}
	});
});
