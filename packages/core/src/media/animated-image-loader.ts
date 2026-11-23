// Downloads and decodes animated images (GIF, APNG, WebP, AVIF) with the browser's ImageDecoder,
// shared between the <AnimatedImage> components that show the same file.
import { type AnimatedImageTimeline, animatedImageTimeline } from "./animated-image-timing.js";

/** Options for loading an animated image. */
export interface AnimatedImageLoadOptions {
	/** Passed to `fetch()`; its `signal` is replaced by the loader's own. */
	requestInit?: RequestInit;
}

/** A decoded animated image: its size, its timing, and its frames as bitmaps. */
export interface DecodedAnimatedImage {
	/** Intrinsic size of the image in pixels. */
	readonly width: number;
	readonly height: number;
	readonly frameCount: number;
	readonly timeline: AnimatedImageTimeline;
	/** The bitmap of frame `index` if it is decoded and cached, else `null`. */
	frame(index: number): ImageBitmap | null;
	/** Decodes frame `index` (or takes it from the cache). */
	load(index: number): Promise<ImageBitmap>;
}

/** Decoded frames kept per image, in bytes of RGBA pixels. Older frames are decoded again. */
export const FRAME_CACHE_BYTES = 128 * 1024 * 1024;

/** Formats recognised from the first bytes of the file, so a generic content type still works. */
export function sniffImageType(bytes: Uint8Array): string | null {
	const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
	if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "image/gif";
	if (
		bytes[0] === 0x89 &&
		ascii(1, 4) === "PNG" &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	) {
		return "image/png";
	}
	if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
	if (ascii(4, 8) === "ftyp") {
		// The major brand, then the compatible brands, until the end of the ftyp box.
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const boxEnd = Math.min(bytes.length >= 4 ? view.getUint32(0) : 0, bytes.length);
		for (let at = 8; at + 4 <= boxEnd; at += at === 8 ? 8 : 4) {
			const brand = ascii(at, at + 4);
			if (brand === "avif" || brand === "avis") return "image/avif";
		}
	}
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
	return null;
}

/** Minimal shape of the WebCodecs `ImageDecoder` used here (not in every TypeScript DOM lib). */
interface DecodedVideoFrame {
	readonly displayWidth: number;
	readonly displayHeight: number;
	readonly duration: number | null;
	close(): void;
}
interface ImageDecoderLike {
	readonly tracks: {
		readonly ready: Promise<void>;
		readonly selectedTrack: { readonly frameCount: number; readonly animated: boolean } | null;
	};
	decode(options: { frameIndex: number }): Promise<{ image: DecodedVideoFrame }>;
	close(): void;
}
interface ImageDecoderConstructor {
	new (init: { data: ArrayBuffer; type: string }): ImageDecoderLike;
	isTypeSupported(type: string): Promise<boolean>;
}

const imageDecoderClass = (): ImageDecoderConstructor | undefined =>
	(globalThis as { ImageDecoder?: ImageDecoderConstructor }).ImageDecoder;

/** Thrown once the image was released while it was still loading. */
class Released extends Error {}

class Loaded implements DecodedAnimatedImage {
	readonly width: number;
	readonly height: number;
	readonly frameCount: number;
	readonly timeline: AnimatedImageTimeline;
	/** Cached bitmaps in least recently used order (the first is evicted first). */
	private readonly cache = new Map<number, ImageBitmap>();
	private readonly pending = new Map<number, Promise<ImageBitmap>>();
	private closed = false;

	constructor(
		private readonly decoder: ImageDecoderLike,
		info: { width: number; height: number; frameCount: number; timeline: AnimatedImageTimeline },
		private readonly budgetBytes: number,
	) {
		this.width = info.width;
		this.height = info.height;
		this.frameCount = info.frameCount;
		this.timeline = info.timeline;
	}

	private get maxFrames(): number {
		return Math.max(1, Math.floor(this.budgetBytes / Math.max(1, this.width * this.height * 4)));
	}

	frame(index: number): ImageBitmap | null {
		const bitmap = this.cache.get(index);
		if (!bitmap) return null;
		this.cache.delete(index);
		this.cache.set(index, bitmap);
		return bitmap;
	}

	store(index: number, bitmap: ImageBitmap): void {
		if (this.closed) {
			bitmap.close();
			return;
		}
		this.cache.get(index)?.close();
		this.cache.delete(index);
		this.cache.set(index, bitmap);
		while (this.cache.size > this.maxFrames) {
			const [oldest, evicted] = this.cache.entries().next().value as [number, ImageBitmap];
			this.cache.delete(oldest);
			evicted.close();
		}
	}

	load(index: number): Promise<ImageBitmap> {
		if (this.closed) return Promise.reject(new Released("The image was released."));
		if (!Number.isInteger(index) || index < 0 || index >= this.frameCount) {
			return Promise.reject(
				new RangeError(`Frame ${index} does not exist: the image has ${this.frameCount} frames.`),
			);
		}
		const cached = this.frame(index);
		if (cached) return Promise.resolve(cached);
		let promise = this.pending.get(index);
		if (!promise) {
			promise = this.decoder
				.decode({ frameIndex: index })
				.then(async ({ image }) => {
					try {
						return await createImageBitmap(image as unknown as ImageBitmapSource);
					} finally {
						image.close();
					}
				})
				.then((bitmap) => {
					this.store(index, bitmap);
					if (this.closed) throw new Released("The image was released.");
					return bitmap;
				})
				.finally(() => this.pending.delete(index));
			this.pending.set(index, promise);
		}
		return promise;
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		for (const bitmap of this.cache.values()) bitmap.close();
		this.cache.clear();
		this.decoder.close();
	}
}

/**
 * Fetches `src` and decodes every frame once, to learn the frame durations; frames are kept as
 * bitmaps up to `budgetBytes` and decoded again on demand past it. The format comes from the
 * file's first bytes, or from the response's content type when they are not recognised.
 */
async function loadAnimatedImage(
	src: string,
	options: AnimatedImageLoadOptions,
	signal: AbortSignal,
	budgetBytes: number,
	onDecoder: (image: Loaded) => void,
): Promise<Loaded> {
	const Decoder = imageDecoderClass();
	if (!Decoder) {
		throw new Error(
			"this browser has no ImageDecoder (WebCodecs), which decodes animated images: use Chrome or Firefox, or <Gif> from @motiojs/gif for GIF files.",
		);
	}
	const response = await fetch(src, { ...options.requestInit, signal });
	if (!response.ok) {
		throw new Error(`the server answered HTTP ${response.status} ${response.statusText}`.trim());
	}
	const data = await response.arrayBuffer();
	const served = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || null;
	const type = sniffImageType(new Uint8Array(data)) ?? served;
	if (type === null || !(await Decoder.isTypeSupported(type))) {
		throw new Error(
			`the file is not an image this browser can decode (served as ${served ?? "no content type"}): use a GIF, APNG, WebP or AVIF file.`,
		);
	}
	const decoder = new Decoder({ data, type });
	let image: Loaded | null = null;
	const bitmaps: ImageBitmap[] = [];
	try {
		await decoder.tracks.ready;
		const track = decoder.tracks.selectedTrack;
		if (!track || track.frameCount === 0) throw new Error("the image has no frames.");
		const durations: Array<number | null> = [];
		let width = 0;
		let height = 0;
		const keep = (w: number, h: number) =>
			Math.max(1, Math.floor(budgetBytes / Math.max(1, w * h * 4)));
		for (let i = 0; i < track.frameCount; i++) {
			if (signal.aborted) throw new Released("The image was released.");
			const { image: frame } = await decoder.decode({ frameIndex: i });
			try {
				if (i === 0) {
					width = frame.displayWidth;
					height = frame.displayHeight;
				}
				durations.push(frame.duration);
				if (i < keep(width, height)) {
					bitmaps.push(await createImageBitmap(frame as unknown as ImageBitmapSource));
				}
			} finally {
				frame.close();
			}
		}
		image = new Loaded(
			decoder,
			{
				width,
				height,
				frameCount: track.frameCount,
				timeline: animatedImageTimeline(durations, track.animated),
			},
			budgetBytes,
		);
		for (const [i, bitmap] of bitmaps.entries()) image.store(i, bitmap);
		bitmaps.length = 0;
		if (signal.aborted) throw new Released("The image was released.");
		onDecoder(image);
		return image;
	} catch (error) {
		for (const bitmap of bitmaps) bitmap.close();
		if (image) image.close();
		else decoder.close();
		throw error;
	}
}

interface Entry {
	promise: Promise<Loaded>;
	controller: AbortController;
	users: number;
	image: Loaded | null;
}

const cache = new Map<string, Entry>();

/**
 * A shared, reference-counted load of `src`: components showing the same file decode it once.
 * `requestInit` is read by the first user. `release()` drops the reference; the last one aborts a
 * pending download and frees the decoder and the frames.
 */
export function acquireAnimatedImage(
	src: string,
	options: AnimatedImageLoadOptions = {},
	budgetBytes = FRAME_CACHE_BYTES,
): { promise: Promise<DecodedAnimatedImage>; release: () => void } {
	let entry = cache.get(src);
	if (!entry) {
		const controller = new AbortController();
		const created: Entry = {
			controller,
			users: 0,
			image: null,
			promise: Promise.resolve(null as unknown as Loaded),
		};
		created.promise = loadAnimatedImage(src, options, controller.signal, budgetBytes, (image) => {
			created.image = image;
		});
		// A failed load is not kept: the next user retries.
		created.promise.catch(() => {
			if (cache.get(src) === created) cache.delete(src);
		});
		cache.set(src, created);
		entry = created;
	}
	const held = entry;
	held.users++;
	let released = false;
	return {
		promise: held.promise,
		release: () => {
			if (released) return;
			released = true;
			held.users--;
			if (held.users === 0) {
				if (cache.get(src) === held) cache.delete(src);
				held.controller.abort();
				held.image?.close();
			}
		},
	};
}

/** Whether `error` only says the image was released while loading (not a failure to report). */
export const isReleased = (error: unknown): boolean =>
	error instanceof Released || (error instanceof DOMException && error.name === "AbortError");
