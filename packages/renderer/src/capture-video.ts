import type { MixedAudio } from "@motiojs/audio";
import type { AudioIntent, FrameReport } from "@motiojs/core/protocol";
import { buildAudioSegments, mixSegments } from "./audio.js";
import { Encoder } from "./ffmpeg.js";
import { DEFAULT_CRASH_RETRIES, runPool, type SlowFrame } from "./pool.js";
import type { RenderPage } from "./render-page.js";
import { ReorderBuffer } from "./reorder-buffer.js";
import type { BrowserSession, VideoConfig } from "./session.js";

/** Work for `captureVideo()`. */
export interface CaptureVideoJob {
	ffmpeg: string;
	/** Arguments of the FFmpeg run that reads the images from stdin. */
	encoderArgs: string[];
	/** Composition frames in output order (ascending). */
	frames: readonly number[];
	/** The order frames are requested in; default `frames`. Frames are still encoded in order. */
	order?: readonly number[];
	openPage: () => Promise<RenderPage>;
	format: "jpeg" | "png";
	quality: number;
	concurrency: number;
	recycleEveryNFrames: number;
	signal: AbortSignal;
	/** Receives the report of every captured frame (the audio intents). */
	onReport?: (frame: number, report: FrameReport) => void;
	/** Rendered and encoded frame counts. */
	onProgress?: (rendered: number, encoded: number) => void;
}

/** Result of `captureVideo()`. */
export interface CaptureVideoResult {
	slowestFrames: SlowFrame[];
	/** Milliseconds until the last frame was captured. */
	renderedDoneIn: number;
}

/**
 * Renders frames on the page pool and streams them, in order, through a reorder buffer into one
 * FFmpeg run. Aborting the signal kills FFmpeg and stops the pages.
 */
export async function captureVideo(job: CaptureVideoJob): Promise<CaptureVideoResult> {
	const start = performance.now();
	const total = job.frames.length;
	let rendered = 0;
	let renderedDoneIn = 0;
	const enc = Encoder.start(job.ffmpeg, job.encoderArgs, (n) => job.onProgress?.(rendered, n));
	const onAbort = () => {
		void enc.kill();
	};
	job.signal.addEventListener("abort", onAbort, { once: true });
	const order = job.order ?? job.frames;
	const ascending = order.every((f, i) => i === 0 || f > (order[i - 1] as number));
	const indexOf = new Map(job.frames.map((f, i) => [f, i]));
	const buffer = new ReorderBuffer<Buffer>(
		total,
		(_, image) => enc.write(image),
		ascending ? Math.max(8, job.concurrency * 4) : Number.POSITIVE_INFINITY,
	);
	const onAbortBuffer = () => buffer.abort(job.signal.reason);
	job.signal.addEventListener("abort", onAbortBuffer, { once: true });
	try {
		const slowestFrames = await runPool({
			frames: order,
			concurrency: job.concurrency,
			openPage: job.openPage,
			format: job.format,
			quality: job.quality,
			recycleEveryNFrames: job.recycleEveryNFrames,
			crashRetries: DEFAULT_CRASH_RETRIES,
			signal: job.signal,
			onFrame: async ({ frame, image, report }) => {
				job.onReport?.(frame, report);
				await buffer.push(indexOf.get(frame) as number, image);
				rendered++;
				if (rendered === total) renderedDoneIn = performance.now() - start;
				job.onProgress?.(rendered, enc.encodedFrames);
			},
		});
		await buffer.done();
		await enc.finish();
		if (job.signal.aborted) throw job.signal.reason;
		return { slowestFrames, renderedDoneIn };
	} catch (err) {
		buffer.abort(err);
		throw job.signal.aborted ? job.signal.reason : err;
	} finally {
		job.signal.removeEventListener("abort", onAbort);
		job.signal.removeEventListener("abort", onAbortBuffer);
		await enc.kill();
	}
}

/** Work for `collectAudioIntents()`. */
export interface AudioIntentsJob {
	/** Composition frames of the output timeline, in order. */
	audioFrames: readonly number[];
	/** Intents already collected by the capture; completed in place. */
	intents: Map<number, AudioIntent[]>;
	openPage: () => Promise<RenderPage>;
	concurrency: number;
	recycleEveryNFrames: number;
	signal: AbortSignal;
}

/**
 * Seeks the frames of `audioFrames` the capture did not visit, without capturing them, and adds
 * their audio intents to `job.intents`.
 */
export async function collectAudioIntents(job: AudioIntentsJob): Promise<void> {
	const missing = job.audioFrames.filter((f) => !job.intents.has(f));
	if (missing.length === 0) return;
	try {
		await runPool({
			frames: missing,
			concurrency: job.concurrency,
			openPage: job.openPage,
			format: "jpeg",
			quality: 80,
			capture: false,
			recycleEveryNFrames: job.recycleEveryNFrames,
			crashRetries: DEFAULT_CRASH_RETRIES,
			signal: job.signal,
			onFrame: async ({ frame, report }) => {
				job.intents.set(frame, report.audio);
			},
		});
	} catch (err) {
		throw job.signal.aborted ? job.signal.reason : err;
	}
	if (job.signal.aborted) throw job.signal.reason;
}

/** Work for `mixTimelineAudio()`. */
export interface TimelineAudioJob extends AudioIntentsJob {
	session: BrowserSession;
	composition: VideoConfig;
	sampleRate: number;
}

/**
 * The audio pass (D-030): seeks the frames the capture did not visit without capturing them, so
 * `frameRange`, `everyNthFrame` and audio-only output cannot drop audio, then mixes the timeline.
 * Returns null when nothing is audible.
 */
export async function mixTimelineAudio(job: TimelineAudioJob): Promise<MixedAudio | null> {
	await collectAudioIntents(job);
	const mixed = await mixSegments({
		segments: buildAudioSegments(job.audioFrames, job.intents),
		media: job.session.media,
		fps: job.composition.fps,
		durationInFrames: job.audioFrames.length,
		sampleRate: job.sampleRate,
		ffmpeg: job.session.ffmpeg,
		ffprobe: job.session.ffprobe,
		signal: job.signal,
	});
	if (job.signal.aborted) throw job.signal.reason;
	return mixed;
}
