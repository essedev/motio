// Runs Motio's media-utils in the pinned chrome-headless-shell over the grid in
// fixtures/media-utils (the same probe the oracle recorder runs) and compares with the recordings
// of @remotion/media-utils 4.0.545. Tolerances are stated per function; see COMPAT.md.
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import puppeteer, { type Browser } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type LoggedRequest, startFixtureServer } from "../../../fixtures/media-utils/server.ts";
import { testChromeArgs } from "../../testing/src/browser.js";

const root = resolve(import.meta.dirname, "../../..");
const fixtures = join(root, "fixtures/media-utils");
const chrome =
	process.env.MOTIO_BROWSER_EXECUTABLE ??
	resolve(
		process.env.HOME ?? "",
		".cache/motio/browsers/chrome-headless-shell/mac_arm-158.0.8127.36/chrome-headless-shell-mac-arm64/chrome-headless-shell",
	);

type Outcome<T = unknown> = { ok?: T; error?: string; name?: string };
type Entry = Outcome<number[]> & Record<string, unknown>;
interface Windowed {
	src: string;
	windowInSeconds: number;
	frame: number;
	resultId: string | null;
	dataOffsetInSeconds: number | null;
	sampleRate: number | null;
	durationInSeconds: number | null;
	numberOfChannels: number | null;
	length: number | null;
	isRemote: boolean | null;
	visualizeAudio?: Outcome<number[]>;
	visualizeAudioWaveform?: Outcome<number[]>;
}
interface Result {
	getAudioData: Record<string, unknown>;
	caching: unknown;
	isRemote: unknown;
	visualizeAudio: Entry[];
	getWaveformPortion: (Outcome<{ index: number; amplitude: number }[]> & Record<string, unknown>)[];
	visualizeAudioWaveform: Entry[];
	synthetic: {
		visualizeAudio: Entry[];
		visualizeAudioZeros: Outcome<number[]>;
		visualizeAudioWaveform: Entry[];
		getWaveformPortion: (Outcome<{ index: number; amplitude: number }[]> &
			Record<string, unknown>)[];
	};
	createSmoothSvgPath: Outcome<string>[];
	audioBufferToDataUrl: Record<string, unknown>;
	durations: Record<string, Outcome>;
	videoMetadata: Record<string, Outcome>;
	imageDimensions: Record<string, unknown>;
	useAudioData: unknown[];
	useWindowedAudioData: Windowed[];
}

const golden = JSON.parse(
	readFileSync(join(fixtures, "__golden__/remotion/media-utils.json"), "utf8"),
) as Result & { requestInitHeader: boolean };

let browser: Browser;
let servers: Server[] = [];
const log: LoggedRequest[] = [];
let got: Result;

beforeAll(async () => {
	const out = await build({
		stdin: {
			contents: `
import * as M from "${join(import.meta.dirname, "index.ts")}";
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { runProbe } from "${join(fixtures, "probe.ts")}";
window.runProbe = (other) => runProbe({ M, React, createRoot, flushSync }, other);
`,
			resolveDir: import.meta.dirname,
			loader: "ts",
		},
		bundle: true,
		write: false,
		format: "iife",
		platform: "browser",
		define: { "process.env.NODE_ENV": '"production"' },
	});
	const html = `<!doctype html><html><body><script>${out.outputFiles[0]?.text ?? ""}</script></body></html>`;
	const main = await startFixtureServer(html, { cors: false, log });
	const other = await startFixtureServer(html, { cors: true, log });
	servers = [main.server, other.server];
	browser = await puppeteer.launch({
		executablePath: chrome,
		headless: true,
		args: testChromeArgs(["--autoplay-policy=no-user-gesture-required"]),
	});
	const page = await browser.newPage();
	await page.goto(`${main.origin}/`);
	got = (await page.evaluate(
		(o) => (window as unknown as { runProbe(x: string): Promise<unknown> }).runProbe(o),
		other.origin,
	)) as Result;
});

afterAll(async () => {
	await browser?.close();
	for (const s of servers) s.close();
});

/** Largest absolute and relative difference between two equally long number arrays. */
function diff(a: number[], b: number[]): { abs: number; rel: number } {
	expect(b.length).toBe(a.length);
	let abs = 0;
	let rel = 0;
	a.forEach((x, i) => {
		const y = b[i] as number;
		if (Object.is(x, y) || x === y) return;
		const d = Math.abs(x - y);
		abs = Math.max(abs, d);
		rel = Math.max(rel, d / Math.max(Math.abs(x), Number.MIN_VALUE));
	});
	return { abs, rel };
}

/** Compares numeric outcomes within `abs` or `rel`; errors must match exactly. */
function expectClose(
	expected: Outcome<number[]>,
	actual: Outcome<number[]>,
	abs: number,
	rel: number,
) {
	if (expected.ok === undefined) {
		expect({ error: actual.error, name: actual.name }).toEqual({
			error: expected.error,
			name: expected.name,
		});
		return;
	}
	expect(actual.error).toBeUndefined();
	const a = expected.ok;
	const b = actual.ok as number[];
	expect(b.length).toBe(a.length);
	a.forEach((x, i) => {
		const y = b[i] as number;
		const d = Math.abs(x - y);
		if (!(d <= abs || d <= rel * Math.abs(x))) {
			expect.fail(`index ${i}: expected ${x}, got ${y} (|d| = ${d})`);
		}
	});
}

const REMOTION_MEDIABUNNY = "https://www.remotion.dev/docs/mediabunny/metadata";
const MOTIO_MEDIABUNNY = "https://mediabunny.dev/guide/reading-media-files";
const withMotioLink = (o: Outcome) =>
	o.error === undefined
		? o
		: { ...o, error: o.error.replace(REMOTION_MEDIABUNNY, MOTIO_MEDIABUNNY) };

describe("media-utils against @remotion/media-utils 4.0.545 in the same browser", () => {
	it("records a meaningful grid", () => {
		expect(golden.visualizeAudio.length).toBeGreaterThan(400);
		expect(got.visualizeAudio.length).toBe(golden.visualizeAudio.length);
		expect(got.visualizeAudio.some((e) => (e.ok?.[0] ?? 0) > 0.01)).toBe(true);
	});

	it("getAudioData decodes bit-identically (SHA-256 of every channel) with the same metadata", () => {
		expect(got.getAudioData).toEqual(golden.getAudioData);
	});

	it("getAudioData caches by src and sample rate, reports isRemote and forwards requestInit", () => {
		expect(got.caching).toEqual(golden.caching);
		expect(got.isRemote).toEqual(golden.isRemote);
		expect(golden.requestInitHeader).toBe(true);
		expect(log.some((r) => r.path === "/tone.wav" && r.probeHeader === "request-init")).toBe(true);
	});

	it("visualizeAudio matches within 1e-12 absolute or 1e-9 relative (FFT summation order)", () => {
		let worst = 0;
		golden.visualizeAudio.forEach((e, i) => {
			const g = got.visualizeAudio[i] as Entry;
			expect({ ...g, ok: undefined }).toEqual({ ...e, ok: undefined });
			expectClose(e, g, 1e-12, 1e-9);
			if (e.ok && g.ok) worst = Math.max(worst, diff(e.ok, g.ok).abs);
		});
		expect(worst).toBeLessThan(1e-12);
	});

	it("getWaveformPortion matches within 1e-15 (last-bit rounding)", () => {
		golden.getWaveformPortion.forEach((e, i) => {
			const g = got.getWaveformPortion[i] as typeof e;
			expectClose(
				{ ...e, ok: e.ok?.map((b) => b.amplitude) },
				{ ...g, ok: g.ok?.map((b) => b.amplitude) },
				1e-15,
				0,
			);
			expect(g.ok?.map((b) => b.index)).toEqual(e.ok?.map((b) => b.index));
		});
	});

	it("visualizeAudioWaveform matches within 1e-15", () => {
		golden.visualizeAudioWaveform.forEach((e, i) => {
			expectClose(e, got.visualizeAudioWaveform[i] as Entry, 1e-15, 0);
		});
	});

	it("synthetic edge cases and errors match", () => {
		const s = golden.synthetic;
		s.visualizeAudio.forEach((e, i) => {
			expectClose(e, got.synthetic.visualizeAudio[i] as Entry, 1e-12, 1e-9);
		});
		expectClose(s.visualizeAudioZeros, got.synthetic.visualizeAudioZeros, 0, 0);
		s.visualizeAudioWaveform.forEach((e, i) => {
			expectClose(e, got.synthetic.visualizeAudioWaveform[i] as Entry, 1e-15, 0);
		});
		s.getWaveformPortion.forEach((e, i) => {
			const g = got.synthetic.getWaveformPortion[i] as typeof e;
			expectClose(
				{ ...e, ok: e.ok?.map((b) => b.amplitude) },
				{ ...g, ok: g.ok?.map((b) => b.amplitude) },
				1e-15,
				0,
			);
		});
	});

	it("createSmoothSvgPath strings are identical", () => {
		expect(got.createSmoothSvgPath).toEqual(golden.createSmoothSvgPath);
	});

	it("audioBufferToDataUrl output is identical", () => {
		expect(got.audioBufferToDataUrl).toEqual(golden.audioBufferToDataUrl);
	});

	it("getAudioDurationInSeconds and getVideoMetadata match, errors included", () => {
		const norm = (r: Record<string, Outcome>) =>
			Object.fromEntries(Object.entries(r).map(([k, v]) => [k, withMotioLink(v)]));
		expect(got.durations).toEqual(norm(golden.durations));
		expect(got.videoMetadata).toEqual(norm(golden.videoMetadata));
	});

	it("getImageDimensions matches", () => {
		expect(got.imageDimensions).toEqual(golden.imageDimensions);
	});

	it("useAudioData goes through the same states", () => {
		expect(got.useAudioData).toEqual(golden.useAudioData);
	});

	it("useWindowedAudioData loads the same windows of WAV files", () => {
		const wav = (w: Windowed) => w.src.endsWith(".wav");
		golden.useWindowedAudioData.filter(wav).forEach((e) => {
			const g = got.useWindowedAudioData.find(
				(x) => x.src === e.src && x.windowInSeconds === e.windowInSeconds && x.frame === e.frame,
			) as Windowed;
			const pick = (w: Windowed) => ({
				resultId: w.resultId,
				dataOffsetInSeconds: w.dataOffsetInSeconds,
				sampleRate: w.sampleRate,
				durationInSeconds: w.durationInSeconds,
				numberOfChannels: w.numberOfChannels,
				isRemote: w.isRemote,
			});
			expect(pick(g)).toEqual(pick(e));
			// Remotion's windows overlap by up to one sample at each boundary (COMPAT.md); Motio's
			// tile the file exactly.
			const windows = (e.resultId ?? "").split("-windows-")[1]?.split(",").length ?? 0;
			const extra = (e.length ?? 0) - (g.length ?? 0);
			expect(extra).toBeGreaterThanOrEqual(0);
			expect(extra).toBeLessThanOrEqual(windows);
		});
	});

	it("visualizations of windowed WAV data stay within the documented error", () => {
		let worstSpectrum = 0;
		let worstWaveform = 0;
		golden.useWindowedAudioData
			.filter((w) => w.src.endsWith(".wav"))
			.forEach((e) => {
				const g = got.useWindowedAudioData.find(
					(x) => x.src === e.src && x.windowInSeconds === e.windowInSeconds && x.frame === e.frame,
				) as Windowed;
				if (e.visualizeAudio?.ok && g.visualizeAudio?.ok) {
					worstSpectrum = Math.max(
						worstSpectrum,
						diff(e.visualizeAudio.ok, g.visualizeAudio.ok).abs,
					);
				}
				if (e.visualizeAudioWaveform?.ok && g.visualizeAudioWaveform?.ok) {
					worstWaveform = Math.max(
						worstWaveform,
						diff(e.visualizeAudioWaveform.ok, g.visualizeAudioWaveform.ok).abs,
					);
				}
			});
		console.log({ worstSpectrum, worstWaveform });
		expect(worstSpectrum).toBeLessThan(0.05);
		expect(worstWaveform).toBeLessThan(0.05);
	});
});
