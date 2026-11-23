import type { FrameReport } from "@motiojs/core/protocol";
import { isMotioError, MotioError } from "./errors.js";
import type { RenderPage } from "./render-page.js";

/** Image format the pool captures. */
export type CaptureFormat = "jpeg" | "png" | "webp";

/** A frame the pool rendered and captured. */
export interface CapturedFrame {
	frame: number;
	image: Buffer;
	report: FrameReport;
	/** Seek plus capture time, in milliseconds. */
	timeMs: number;
}

/** One of the slowest frames of a render. */
export interface SlowFrame {
	frame: number;
	time: number;
}

/** Work for the page pool. */
export interface PoolJob {
	/** Frames in the order they are requested. */
	frames: readonly number[];
	concurrency: number;
	/** Opens a page with the composition selected. */
	openPage: () => Promise<RenderPage>;
	format: CaptureFormat;
	quality: number;
	/** False seeks without capturing (the audio pass); `image` is then empty. Default true. */
	capture?: boolean;
	/** Replace a page with a fresh one after this many frames; 0 never. */
	recycleEveryNFrames: number;
	/** Times a frame is retried after a browser crash or a watchdog timeout. */
	crashRetries: number;
	signal: AbortSignal;
	/** Receives every frame; awaiting it applies backpressure to the worker. */
	onFrame: (frame: CapturedFrame) => Promise<void>;
}

/** Default number of frames after which a page is replaced. */
export const DEFAULT_RECYCLE_EVERY_N_FRAMES = 500;
/** Default retries of a frame whose browser crashed or stopped responding. */
export const DEFAULT_CRASH_RETRIES = 2;

const CRASH_CODES = new Set(["E_BROWSER_CRASHED", "E_SEEK_TIMEOUT", "E_CAPTURE_FAILED"]);

/**
 * Whether a failed frame is retried on a fresh page. A readiness timeout follows the handle's
 * own `retries` (Remotion's `delayRender(label, { retries })`, default 0); a crash or an
 * unresponsive page gets `crashRetries`. Errors from user code are deterministic and fail at
 * once.
 */
export function shouldRetry(err: unknown, attempt: number, crashRetries: number): boolean {
	if (!isMotioError(err)) return false;
	if (err.code === "E_READINESS_TIMEOUT") {
		const retries = (err as MotioError & { retries?: number }).retries ?? 0;
		return attempt < retries;
	}
	if (CRASH_CODES.has(err.code)) return attempt < crashRetries;
	return false;
}

/**
 * Renders frames on a pool of pages, one browser process each (D-007). Workers pull frames from
 * a shared queue; the first failure or an abort stops every worker and closes every page.
 * Returns the ten slowest frames.
 */
export async function runPool(job: PoolJob): Promise<SlowFrame[]> {
	const queue = [...job.frames];
	const open = new Set<RenderPage>();
	const slowest: SlowFrame[] = [];
	let stopReason: unknown;

	const stop = (reason: unknown) => {
		if (stopReason !== undefined) return;
		stopReason = reason;
		for (const p of open) void p.close();
	};
	const onAbort = () =>
		stop(job.signal.reason ?? new MotioError("E_CANCELLED", "The render got cancelled"));
	if (job.signal.aborted) onAbort();
	job.signal.addEventListener("abort", onAbort, { once: true });

	const track = (frame: number, time: number) => {
		slowest.push({ frame, time });
		slowest.sort((a, b) => b.time - a.time);
		if (slowest.length > 10) slowest.length = 10;
	};

	const worker = async () => {
		let page: RenderPage | undefined;
		let sinceOpen = 0;
		const close = async () => {
			if (!page) return;
			const p = page;
			page = undefined;
			open.delete(p);
			await p.close();
		};
		try {
			while (stopReason === undefined) {
				const frame = queue.shift();
				if (frame === undefined) break;
				let captured: CapturedFrame | undefined;
				for (let attempt = 0; captured === undefined; attempt++) {
					try {
						if (!page) {
							const p = await job.openPage();
							page = p;
							open.add(p);
							sinceOpen = 0;
							if (stopReason !== undefined) await close();
						}
						if (stopReason !== undefined || !page) break;
						const t0 = performance.now();
						const report = await page.seek(frame);
						const image =
							job.capture === false
								? Buffer.alloc(0)
								: await page.capture(job.format, job.quality, frame);
						captured = { frame, image, report, timeMs: performance.now() - t0 };
					} catch (err) {
						await close();
						if (stopReason !== undefined) break;
						if (!shouldRetry(err, attempt, job.crashRetries)) throw err;
					}
				}
				if (stopReason !== undefined || !captured) break;
				sinceOpen++;
				track(frame, captured.timeMs);
				await job.onFrame(captured);
				if (job.recycleEveryNFrames > 0 && sinceOpen >= job.recycleEveryNFrames) await close();
			}
		} catch (err) {
			stop(err);
		} finally {
			await close();
		}
	};

	const workers = Math.max(1, Math.min(job.concurrency, job.frames.length));
	try {
		await Promise.all(Array.from({ length: workers }, () => worker()));
	} finally {
		job.signal.removeEventListener("abort", onAbort);
		await Promise.all([...open].map((p) => p.close()));
	}
	if (stopReason !== undefined) throw stopReason;
	return slowest;
}
