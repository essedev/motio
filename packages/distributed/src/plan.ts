import { DistributedError } from "./errors.js";

/** A contiguous range of composition frames rendered and encoded independently. */
export interface Chunk {
	index: number;
	/** First frame, inclusive. */
	start: number;
	/** Last frame, inclusive. */
	end: number;
}

export interface PlanOptions {
	/** Inclusive frame range of the whole render. */
	frameRange: readonly [number, number];
	/** Frames per chunk. Mutually exclusive with `chunks`. */
	framesPerChunk?: number;
	/** Number of chunks. Mutually exclusive with `framesPerChunk`. */
	chunks?: number;
	/**
	 * Chunk boundaries fall on multiples of this many frames from the range start, so every
	 * chunk starts on a keyframe of a fixed GOP. Default 1.
	 */
	alignTo?: number;
}

/**
 * Splits a frame range into contiguous chunks covering it exactly once: no gap, no overlap.
 * Each chunk is encoded on its own, so it starts with a keyframe (closed GOP).
 */
export function planChunks(options: PlanOptions): Chunk[] {
	const [first, last] = options.frameRange;
	if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last < first) {
		throw new DistributedError("E_CHUNK_PLAN", `invalid frame range [${first}, ${last}]`, {
			frameRange: options.frameRange,
		});
	}
	const total = last - first + 1;
	const align = options.alignTo ?? 1;
	if (!Number.isInteger(align) || align < 1)
		throw new DistributedError("E_CHUNK_PLAN", `alignTo must be a positive integer, got ${align}`);
	if ((options.framesPerChunk === undefined) === (options.chunks === undefined)) {
		throw new DistributedError("E_CHUNK_PLAN", "pass exactly one of framesPerChunk and chunks");
	}
	let size: number;
	if (options.framesPerChunk !== undefined) {
		if (!Number.isInteger(options.framesPerChunk) || options.framesPerChunk < 1) {
			throw new DistributedError(
				"E_CHUNK_PLAN",
				`framesPerChunk must be a positive integer, got ${options.framesPerChunk}`,
			);
		}
		size = options.framesPerChunk;
	} else {
		const n = options.chunks ?? 1;
		if (!Number.isInteger(n) || n < 1)
			throw new DistributedError("E_CHUNK_PLAN", `chunks must be a positive integer, got ${n}`);
		size = Math.ceil(total / n);
	}
	size = Math.max(align, Math.ceil(size / align) * align);
	const out: Chunk[] = [];
	for (let start = first, index = 0; start <= last; start += size, index++) {
		out.push({ index, start, end: Math.min(last, start + size - 1) });
	}
	return out;
}
