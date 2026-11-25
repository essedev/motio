import { mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { type AudioCodec, audioCodecArgs } from "@motiojs/audio";
import {
	type BrowserSessionOptions,
	type CancelSignal,
	type Codec,
	type ColorSpace,
	makeCancelSignal,
	type PixelFormat,
	type ProResProfile,
	planChunkedRender,
	renderAudio,
	resolveFfmpeg,
	type VideoConfig,
	type X264Preset,
} from "@motiojs/renderer";
import { assembleChunks } from "./assemble.js";
import { DistributedError } from "./errors.js";
import { LocalChunkWorker } from "./local-worker.js";
import { type Chunk, planChunks } from "./plan.js";
import { run } from "./run.js";
import type { ChunkJob, ChunkRenderSettings, ChunkWorker } from "./worker.js";

/** Progress reported by `renderDistributed()`. */
export interface DistributedProgress {
	/** Frames rendered across all chunks. */
	renderedFrames: number;
	totalFrames: number;
	chunksDone: number;
	totalChunks: number;
	stage: "rendering" | "assembling" | "done";
	/** Overall progress from 0 to 1. */
	progress: number;
}

/** Options of `renderDistributed()`. */
export interface RenderDistributedOptions
	extends Omit<BrowserSessionOptions, "onBrowserLog" | "port"> {
	/** The resolved composition, from `selectComposition()`. */
	composition: VideoConfig;
	codec: Codec;
	/** The assembled output file. */
	outputLocation: string;
	/** Default true. */
	overwrite?: boolean;
	/** One frame or one inclusive range; default the whole composition. */
	frameRange?: number | readonly [number, number] | readonly [number, null] | null;
	/** Frames per chunk; exactly one of `framesPerChunk` and `chunks`. */
	framesPerChunk?: number;
	/** Number of chunks; exactly one of `framesPerChunk` and `chunks`. */
	chunks?: number;
	/** Chunks rendering at the same time. Default: half the CPU threads, at most 8. */
	concurrency?: number;
	/** Pages each chunk renders with. Default 1. */
	concurrencyPerChunk?: number;
	/** Where chunks render. Default a `LocalChunkWorker` (one child process per chunk). */
	worker?: ChunkWorker;
	/** Directory for chunks and audio; default a fresh one in the system temp directory. */
	tempDirectory?: string;
	crf?: number | null;
	imageFormat?: "jpeg" | "png";
	jpegQuality?: number;
	scale?: number;
	pixelFormat?: PixelFormat;
	colorSpace?: ColorSpace;
	x264Preset?: X264Preset | null;
	proResProfile?: ProResProfile | null;
	proResBitsPerMacroblock?: number | null;
	muted?: boolean;
	audioCodec?: AudioCodec | null;
	audioBitrate?: string | null;
	preferLossless?: boolean;
	enforceAudioTrack?: boolean;
	sampleRate?: number | null;
	/**
	 * Write the audio to this file (its codec's format) and leave the video without an audio
	 * track, as `renderMedia()` does. Silence is written when nothing is audible.
	 */
	separateAudioTo?: string | null;
	cancelSignal?: CancelSignal;
	onProgress?: (progress: DistributedProgress) => void;
}

/** Result of `renderDistributed()`. */
export interface RenderDistributedResult {
	outputLocation: string;
	chunks: Chunk[];
	/** Milliseconds spent rendering chunks (and the audio, in parallel), then assembling. */
	timings: { renderMs: number; assembleMs: number };
}

function frameRangeOf(
	value: RenderDistributedOptions["frameRange"],
	durationInFrames: number,
): [number, number] {
	const last = durationInFrames - 1;
	let range: [number, number];
	if (value === null || value === undefined) range = [0, last];
	else if (typeof value === "number") range = [value, value];
	else if (Array.isArray(value) && value.length === 2 && typeof value[0] === "number") {
		range = [value[0], value[1] ?? last];
	} else {
		throw new DistributedError(
			"E_CHUNK_PLAN",
			"frameRange of a chunked render must be one frame or one [start, end] range.",
		);
	}
	if (
		!Number.isInteger(range[0]) ||
		!Number.isInteger(range[1]) ||
		range[0] < 0 ||
		range[1] > last ||
		range[1] < range[0]
	) {
		throw new DistributedError(
			"E_CHUNK_PLAN",
			`frameRange [${range[0]}, ${range[1]}] is outside the composition (frames 0 to ${last}).`,
		);
	}
	return range;
}

/**
 * Runs `count` tasks with at most `limit` at a time. After the first failure no new task starts;
 * the call settles only when every started task has settled, then rejects with that failure, so
 * nothing keeps writing into a directory the caller removes.
 */
async function runLimited(
	count: number,
	limit: number,
	task: (index: number) => Promise<void>,
): Promise<void> {
	let next = 0;
	let failure: { error: unknown } | undefined;
	const runners = Array.from({ length: Math.min(limit, count) }, async () => {
		while (next < count && !failure) {
			const index = next++;
			try {
				await task(index);
			} catch (error) {
				failure ??= { error };
			}
		}
	});
	await Promise.all(runners);
	if (failure) throw failure.error;
}

/**
 * Renders a composition in chunks and assembles them (D-018, D-039): plans contiguous chunks,
 * renders them in parallel through `worker` with the encoder settings of a single-node render,
 * renders the audio once for the whole timeline with the renderer's audio pass, then concatenates
 * the chunks without re-encoding and encodes the audio in the same FFmpeg run, as `renderMedia`
 * does. Options are validated before any chunk renders.
 */
export async function renderDistributed(
	options: RenderDistributedOptions,
): Promise<RenderDistributedResult> {
	const { composition } = options;
	const plan = planChunkedRender(options);
	// Assembly runs here: the same FFmpeg resolution as a render (D-065). Workers resolve their
	// own with the same rules, from the same environment when they are local processes.
	const localFfmpeg = (await resolveFfmpeg(options))?.ffmpeg ?? "ffmpeg";
	const range = frameRangeOf(options.frameRange, composition.durationInFrames);
	const chunks = planChunks({
		frameRange: range,
		...(options.framesPerChunk !== undefined ? { framesPerChunk: options.framesPerChunk } : {}),
		...(options.chunks !== undefined ? { chunks: options.chunks } : {}),
	});
	const concurrency =
		options.concurrency ?? Math.max(1, Math.min(8, Math.floor(availableParallelism() / 2)));
	if (!Number.isInteger(concurrency) || concurrency < 1) {
		throw new DistributedError(
			"E_CHUNK_PLAN",
			`concurrency must be a positive integer, got ${concurrency}`,
		);
	}
	const output = resolve(options.outputLocation);
	if (options.overwrite === false) {
		const exists = await stat(output).then(
			() => true,
			() => false,
		);
		if (exists) {
			throw new DistributedError(
				"E_CHUNK_PLAN",
				`${output} already exists and overwrite is false.`,
				{
					output,
				},
			);
		}
	}

	const separateAudioTo = options.separateAudioTo ? resolve(options.separateAudioTo) : null;
	if (separateAudioTo && options.overwrite === false) {
		const exists = await stat(separateAudioTo).then(
			() => true,
			() => false,
		);
		if (exists) {
			throw new DistributedError(
				"E_CHUNK_PLAN",
				`${separateAudioTo} already exists and overwrite is false.`,
				{ output: separateAudioTo },
			);
		}
	}

	const settings: ChunkRenderSettings = {
		codec: options.codec,
		concurrency: options.concurrencyPerChunk ?? 1,
		...pick(options, [
			"inputProps",
			"envVariables",
			"timeoutInMilliseconds",
			"chromiumOptions",
			"browserExecutable",
			"logLevel",
			"ffmpegExecutable",
			"ffprobeExecutable",
			"captureMethod",
			"pagesPerBrowser",
			"timeModel",
			"raster",
			"canvas",
			"timeZone",
			"crf",
			"imageFormat",
			"jpegQuality",
			"scale",
			"pixelFormat",
			"colorSpace",
			"x264Preset",
			"proResProfile",
			"proResBitsPerMacroblock",
		]),
	};
	const worker = options.worker ?? new LocalChunkWorker();
	const controller = new AbortController();
	const audioCancel = makeCancelSignal();
	controller.signal.addEventListener("abort", () => audioCancel.cancel(), { once: true });
	options.cancelSignal?.(() => {
		if (!controller.signal.aborted) {
			controller.abort(new DistributedError("E_CANCELLED", "renderDistributed() got cancelled"));
		}
	});

	const dir = options.tempDirectory
		? await mkdtemp(join(resolve(options.tempDirectory), "motio-chunks-"))
		: await mkdtemp(join(tmpdir(), "motio-chunks-"));
	const totalFrames = range[1] - range[0] + 1;
	const rendered = new Array<number>(chunks.length).fill(0);
	let chunksDone = 0;
	const report = (stage: DistributedProgress["stage"]) => {
		const renderedFrames = rendered.reduce((a, b) => a + b, 0);
		options.onProgress?.({
			renderedFrames,
			totalFrames,
			chunksDone,
			totalChunks: chunks.length,
			stage,
			progress: stage === "done" ? 1 : Math.min(0.99, (0.95 * renderedFrames) / totalFrames),
		});
	};
	try {
		const started = performance.now();
		const files = chunks.map((c) =>
			join(dir, `chunk-${String(c.index).padStart(5, "0")}${plan.chunks.extension}`),
		);
		const renderChunks = runLimited(chunks.length, concurrency, async (i) => {
			if (controller.signal.aborted) throw controller.signal.reason;
			try {
				await renderOne(i);
			} catch (err) {
				if (!controller.signal.aborted) controller.abort(err);
				throw err;
			}
		});
		async function renderOne(i: number): Promise<void> {
			const job: ChunkJob = {
				serveUrl: options.serveUrl,
				composition,
				chunk: chunks[i] as Chunk,
				output: files[i] as string,
				settings,
			};
			const result = await worker.renderChunk(job, {
				signal: controller.signal,
				onProgress: (n) => {
					rendered[i] = n;
					report("rendering");
				},
			});
			files[i] = result.output;
			rendered[i] = (chunks[i] as Chunk).end - (chunks[i] as Chunk).start + 1;
			chunksDone++;
			report("rendering");
		}
		const renderSound = plan.audio
			? renderAudio({
					...pick(options, [
						"inputProps",
						"envVariables",
						"timeoutInMilliseconds",
						"chromiumOptions",
						"browserExecutable",
						"ffmpegExecutable",
						"ffprobeExecutable",
						"captureMethod",
						"timeModel",
					]),
					// separateAudioTo writes a file even when nothing is audible, as renderMedia() does.
					enforceAudioTrack: options.enforceAudioTrack === true || separateAudioTo !== null,
					serveUrl: options.serveUrl,
					composition,
					frameRange: range,
					sampleRate: plan.audio.sampleRate,
					outputLocation: join(dir, "audio.wav"),
					concurrency: 1,
					cancelSignal: audioCancel.cancelSignal,
				})
			: Promise.resolve(null);
		// A failure on either side cancels the other at once.
		const abortOnFailure = (err: unknown) => {
			if (!controller.signal.aborted) controller.abort(err);
			throw err;
		};
		const [chunkResult, audioResult] = await Promise.allSettled([
			renderChunks.catch(abortOnFailure),
			renderSound.catch(abortOnFailure),
		]);
		const failure = [chunkResult, audioResult].find((r) => r.status === "rejected");
		if (failure) {
			if (!controller.signal.aborted) controller.abort(failure.reason);
			throw controller.signal.reason;
		}
		const audio = audioResult.status === "fulfilled" ? audioResult.value : null;
		const renderMs = performance.now() - started;
		report("assembling");
		if (separateAudioTo && audio?.outputLocation && plan.audio) {
			await mkdir(dirname(separateAudioTo), { recursive: true });
			const part = `${separateAudioTo}.${process.pid}.part${plan.audio.extension}`;
			try {
				await run(localFfmpeg, [
					"-hide_banner",
					"-loglevel",
					"error",
					"-y",
					"-i",
					audio.outputLocation,
					...audioCodecArgs(plan.audio.codec, plan.audio.bitrate),
					part,
				]).catch((e: Error) => {
					throw new DistributedError(
						"E_CHUNK_ASSEMBLE",
						`could not encode the audio into ${separateAudioTo}: ${e.message}`,
						{ output: separateAudioTo },
					);
				});
				await rename(part, separateAudioTo);
			} finally {
				await rm(part, { force: true });
			}
		}
		await mkdir(dirname(output), { recursive: true });
		const part = join(dirname(output), `.${process.pid}-${Date.now()}.part${plan.extension}`);
		try {
			await assembleChunks({
				chunks: files,
				output: part,
				...(audio?.outputLocation && plan.audio && !separateAudioTo
					? {
							audio: audio.outputLocation,
							audioCodec: plan.audio.codec,
							audioBitrate: plan.audio.bitrate,
						}
					: {}),
				...(plan.videoTag ? { videoTag: plan.videoTag } : {}),
				ffmpeg: localFfmpeg,
			});
			await rename(part, output);
		} finally {
			await rm(part, { force: true });
		}
		report("done");
		return {
			outputLocation: output,
			chunks,
			timings: { renderMs, assembleMs: performance.now() - started - renderMs },
		};
	} catch (err) {
		if (!controller.signal.aborted) controller.abort(err);
		throw err;
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** The entries of `keys` that are set in `source`. */
function pick<T extends object, K extends keyof T>(
	source: T,
	keys: readonly K[],
): Partial<Pick<T, K>> {
	const out: Partial<Pick<T, K>> = {};
	for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
	return out;
}
