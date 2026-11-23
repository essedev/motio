import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeCancelSignal, type VideoConfig } from "@motiojs/renderer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderDistributed } from "./render-distributed.js";
import type { ChunkJob, ChunkJobControl, ChunkWorker } from "./worker.js";

const composition: VideoConfig = {
	id: "c",
	width: 64,
	height: 64,
	fps: 30,
	durationInFrames: 100,
	defaultProps: {},
	props: {},
	defaultCodec: null,
	defaultOutName: null,
	defaultVideoImageFormat: null,
	defaultPixelFormat: null,
	defaultProResProfile: null,
	defaultSampleRate: null,
};

let temp: string;
beforeEach(async () => {
	temp = await mkdtemp(join(tmpdir(), "motio-distributed-unit-"));
});
afterEach(() => rm(temp, { recursive: true, force: true }));

/** A worker that records jobs and settles each after `delay` ms, failing the listed chunks. */
function fakeWorker(fail: number[], delay = 20) {
	const started: number[] = [];
	const settled: number[] = [];
	const signals: AbortSignal[] = [];
	const worker: ChunkWorker = {
		renderChunk(job: ChunkJob, control?: ChunkJobControl) {
			started.push(job.chunk.index);
			if (control?.signal) signals.push(control.signal);
			return new Promise((resolve, reject) => {
				const finish = () => {
					settled.push(job.chunk.index);
					if (fail.includes(job.chunk.index)) reject(new Error(`chunk ${job.chunk.index} broke`));
					else if (control?.signal?.aborted) reject(control.signal.reason);
					else resolve({ output: job.output });
				};
				setTimeout(finish, delay * (job.chunk.index + 1));
			});
		},
	};
	return { worker, started, settled, signals };
}

const base = () => ({
	serveUrl: "/nowhere",
	composition,
	codec: "h264" as const,
	outputLocation: join(temp, "out.mp4"),
	muted: true,
	tempDirectory: temp,
});

describe("renderDistributed", () => {
	it("stops starting chunks after a failure, waits for the running ones and cleans up", async () => {
		const { worker, started, settled, signals } = fakeWorker([1]);
		await expect(
			renderDistributed({ ...base(), framesPerChunk: 10, concurrency: 2, worker }),
		).rejects.toThrow(/chunk 1 broke/);
		// Chunks 0 and 1 start; chunk 0 finishes and chunk 2 starts before 1 fails; nothing after.
		expect(started).toEqual([0, 1, 2]);
		expect([...settled].sort()).toEqual([0, 1, 2]);
		expect(signals.every((s) => s.aborted)).toBe(true);
		expect(await readdir(temp)).toEqual([]);
		expect(existsSync(join(temp, "out.mp4"))).toBe(false);
	});

	it("cancels every running chunk through the cancel signal", async () => {
		const { worker, started, signals } = fakeWorker([], 50);
		const { cancelSignal, cancel } = makeCancelSignal();
		const render = renderDistributed({
			...base(),
			chunks: 4,
			concurrency: 4,
			worker,
			cancelSignal,
		});
		setTimeout(cancel, 10);
		await expect(render).rejects.toMatchObject({ code: "E_CANCELLED" });
		expect(started).toEqual([0, 1, 2, 3]);
		expect(signals.every((s) => s.aborted)).toBe(true);
		expect(await readdir(temp)).toEqual([]);
	});

	it("validates before starting any chunk", async () => {
		const { worker, started } = fakeWorker([]);
		await expect(renderDistributed({ ...base(), chunks: 2, worker, codec: "gif" })).rejects.toThrow(
			/one palette/,
		);
		await expect(
			renderDistributed({ ...base(), chunks: 2, worker, frameRange: [0, 100] }),
		).rejects.toThrow(/outside the composition/);
		await expect(
			renderDistributed({ ...base(), chunks: 2, worker, concurrency: 0 }),
		).rejects.toThrow(/positive integer/);
		expect(started).toEqual([]);
	});
});
