import { VideoFramesError } from "./errors.js";
import { splitPngStream } from "./png-stream.js";
import { probeVideo, type VideoInfo } from "./probe.js";
import { run } from "./run.js";

export interface FrameExtractorOptions {
	ffmpeg?: string;
	ffprobe?: string;
	/** Frames kept in memory across all sources. Default 256. */
	cacheSize?: number;
	/** Frames decoded per FFmpeg run, starting at the requested one. Default 24. */
	batchSize?: number;
}

/**
 * FFmpeg's native VP8/VP9 decoders drop the alpha plane of transparent WebM; libvpx keeps it
 * (D-019). libvpx also decodes opaque VP8/VP9, so it is used for every such source.
 */
function decoderArgs(codec: string): string[] {
	if (codec === "vp9") return ["-c:v", "libvpx-vp9"];
	if (codec === "vp8") return ["-c:v", "libvpx"];
	return [];
}

/**
 * Extracts exact source frames as PNG, outside the browser. Requests for the same frame are
 * deduplicated, recent frames are kept in an LRU cache, and a miss decodes a batch of
 * following frames in one FFmpeg run, since renders mostly move forward.
 */
export class FrameExtractor {
	private readonly ffmpeg: string;
	private readonly ffprobe: string;
	private readonly cacheSize: number;
	private readonly batchSize: number;
	private readonly cache = new Map<string, Buffer>();
	private readonly inFlight = new Map<string, Promise<void>>();
	private readonly infos = new Map<string, Promise<VideoInfo>>();

	constructor(options: FrameExtractorOptions = {}) {
		this.ffmpeg = options.ffmpeg ?? "ffmpeg";
		this.ffprobe = options.ffprobe ?? "ffprobe";
		this.cacheSize = options.cacheSize ?? 256;
		this.batchSize = options.batchSize ?? 24;
	}

	/** Stream information, probed once per source. */
	info(src: string): Promise<VideoInfo> {
		let p = this.infos.get(src);
		if (!p) {
			p = probeVideo(src, this.ffprobe);
			p.catch(() => this.infos.delete(src));
			this.infos.set(src, p);
		}
		return p;
	}

	/**
	 * The PNG of source frame `index` (0-based, presentation order). With `alpha: false` the
	 * frame is decoded without its alpha channel (opaque RGB), which is faster for VP8 and VP9.
	 */
	async frame(src: string, index: number, options: { alpha?: boolean } = {}): Promise<Buffer> {
		const alpha = options.alpha ?? true;
		const tag = alpha ? "" : "#opaque";
		const key = `${src}#${index}${tag}`;
		const hit = this.cache.get(key);
		if (hit) {
			this.cache.delete(key);
			this.cache.set(key, hit);
			return hit;
		}
		let pending = this.inFlight.get(key);
		if (!pending) {
			pending = this.decodeBatch(src, index, alpha);
			const keys = Array.from({ length: this.batchSize }, (_, i) => `${src}#${index + i}${tag}`);
			for (const k of keys)
				if (!this.inFlight.has(k) && !this.cache.has(k)) this.inFlight.set(k, pending);
			pending.finally(() => {
				for (const k of keys) if (this.inFlight.get(k) === pending) this.inFlight.delete(k);
			});
		}
		await pending;
		const got = this.cache.get(key);
		if (!got)
			throw new VideoFramesError(
				"E_VIDEO_EXTRACT",
				`frame ${index} of ${src} could not be decoded`,
				{ src, index },
			);
		return got;
	}

	private async decodeBatch(src: string, index: number, alpha: boolean): Promise<void> {
		const { timestamps, codec } = await this.info(src);
		if (index < 0 || index >= timestamps.length) {
			throw new VideoFramesError(
				"E_VIDEO_EXTRACT",
				`frame ${index} is outside ${src} (${timestamps.length} frames)`,
				{ src, index },
			);
		}
		const count = Math.min(this.batchSize, timestamps.length - index);
		const t = timestamps[index] ?? 0;
		const prev = index > 0 ? (timestamps[index - 1] ?? 0) : t - 1;
		// Seek just before the frame's timestamp, never as far back as the previous frame.
		const ss = Math.max(0, t - Math.min(0.0005, (t - prev) / 2));
		let data: Buffer;
		try {
			data = await run(this.ffmpeg, [
				"-hide_banner",
				"-loglevel",
				"error",
				"-nostdin",
				...(alpha ? decoderArgs(codec) : []),
				"-ss",
				ss.toFixed(6),
				"-i",
				src,
				"-an",
				"-frames:v",
				String(count),
				"-fps_mode",
				"passthrough",
				"-f",
				"image2pipe",
				...(alpha ? [] : ["-pix_fmt", "rgb24"]),
				"-c:v",
				"png",
				"-",
			]);
		} catch (e) {
			throw new VideoFramesError(
				"E_VIDEO_EXTRACT",
				`could not decode ${src} at frame ${index}: ${(e as Error).message}`,
				{ src, index },
			);
		}
		const tag = alpha ? "" : "#opaque";
		for (const [i, png] of splitPngStream(data).entries())
			this.store(`${src}#${index + i}${tag}`, png);
	}

	private store(key: string, png: Buffer) {
		this.cache.delete(key);
		this.cache.set(key, png);
		while (this.cache.size > this.cacheSize) {
			const oldest = this.cache.keys().next().value;
			if (oldest === undefined) break;
			this.cache.delete(oldest);
		}
	}
}
