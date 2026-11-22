/**
 * Frame stamps: a frame number drawn as a row of black and white blocks, decoded back from
 * captured or encoded frames to prove that frame N of the output shows frame N of the
 * composition.
 *
 * Layout, left to right, one block per entry: two guard blocks (white, black), 16 data bits
 * (most significant first, white = 1), 4 checksum bits (the sum of the four data nibbles modulo
 * 16, most significant first) and two guard blocks (black, white). With the default 16 px blocks
 * aligned to the 16 px grid, the stamp survives JPEG quality 80, yuv420p chroma subsampling and
 * H.264 at the default CRF: only luma matters and each block is sampled in its centre.
 *
 * This module is pure (no Node or DOM APIs) so fixture pages can draw stamps with it.
 */

/** Number of data bits: frames 0 to 65535 can be stamped. */
export const FRAME_STAMP_BITS = 16;

const CHECK_BITS = 4;
const LEADING_GUARD = [true, false] as const;
const TRAILING_GUARD = [false, true] as const;

/** Total number of blocks in a stamp. */
export const FRAME_STAMP_BLOCKS =
	LEADING_GUARD.length + FRAME_STAMP_BITS + CHECK_BITS + TRAILING_GUARD.length;

/** Where the stamp sits in the frame and how large its blocks are, in pixels. */
export interface FrameStampOptions {
	/** Left edge of the first block. Default 0. */
	x?: number;
	/** Top edge of the blocks. Default 0. */
	y?: number;
	/** Side of each square block. Default 16. */
	blockSize?: number;
}

/** One block of a stamp: a square to fill white (`on`) or black. */
export interface FrameStampBlock {
	x: number;
	y: number;
	size: number;
	on: boolean;
}

/** Result of decoding a stamp from pixels. */
export type FrameStampResult = { ok: true; frame: number } | { ok: false; reason: string };

interface ResolvedOptions {
	x: number;
	y: number;
	blockSize: number;
}

function resolve(options: FrameStampOptions | undefined): ResolvedOptions {
	const blockSize = options?.blockSize ?? 16;
	if (!Number.isInteger(blockSize) || blockSize < 2) {
		throw new RangeError(`blockSize must be an integer of at least 2, got ${blockSize}`);
	}
	return { x: options?.x ?? 0, y: options?.y ?? 0, blockSize };
}

function checksum(frame: number): number {
	return (
		((frame & 0xf) + ((frame >> 4) & 0xf) + ((frame >> 8) & 0xf) + ((frame >> 12) & 0xf)) & 0xf
	);
}

/** The on/off pattern of a stamp for `frame`, guards included. */
export function frameStampBits(frame: number): boolean[] {
	if (!Number.isInteger(frame) || frame < 0 || frame >= 2 ** FRAME_STAMP_BITS) {
		throw new RangeError(`frame must be an integer in [0, ${2 ** FRAME_STAMP_BITS}), got ${frame}`);
	}
	const bits: boolean[] = [...LEADING_GUARD];
	for (let i = FRAME_STAMP_BITS - 1; i >= 0; i--) bits.push(((frame >> i) & 1) === 1);
	const check = checksum(frame);
	for (let i = CHECK_BITS - 1; i >= 0; i--) bits.push(((check >> i) & 1) === 1);
	bits.push(...TRAILING_GUARD);
	return bits;
}

/** The blocks to draw for `frame`. */
export function frameStampBlocks(frame: number, options?: FrameStampOptions): FrameStampBlock[] {
	const { x, y, blockSize } = resolve(options);
	return frameStampBits(frame).map((on, i) => ({ x: x + i * blockSize, y, size: blockSize, on }));
}

/** Width and height covered by a stamp. */
export function frameStampSize(options?: FrameStampOptions): { width: number; height: number } {
	const { blockSize } = resolve(options);
	return { width: FRAME_STAMP_BLOCKS * blockSize, height: blockSize };
}

/**
 * Reads a stamp from an RGBA buffer (row-major, 4 bytes per pixel). Each block is sampled over
 * its central half; luma above 160 reads as on, below 96 as off, anything else is reported as
 * ambiguous rather than guessed.
 */
export function decodeFrameStamp(
	rgba: Uint8Array,
	width: number,
	height: number,
	options?: FrameStampOptions,
): FrameStampResult {
	const { x, y, blockSize } = resolve(options);
	if (x + FRAME_STAMP_BLOCKS * blockSize > width || y + blockSize > height) {
		return { ok: false, reason: `stamp does not fit in a ${width}x${height} frame` };
	}
	if (rgba.length < width * height * 4) {
		return {
			ok: false,
			reason: `buffer holds ${rgba.length} bytes, expected ${width * height * 4}`,
		};
	}
	const inset = Math.floor(blockSize / 4);
	const bits: boolean[] = [];
	for (let b = 0; b < FRAME_STAMP_BLOCKS; b++) {
		const x0 = x + b * blockSize + inset;
		const y0 = y + inset;
		const x1 = x + (b + 1) * blockSize - inset;
		const y1 = y + blockSize - inset;
		let sum = 0;
		let n = 0;
		for (let py = y0; py < y1; py++) {
			for (let px = x0; px < x1; px++) {
				const i = (py * width + px) * 4;
				sum += 0.2126 * (rgba[i] ?? 0) + 0.7152 * (rgba[i + 1] ?? 0) + 0.0722 * (rgba[i + 2] ?? 0);
				n++;
			}
		}
		const luma = sum / n;
		if (luma > 160) bits.push(true);
		else if (luma < 96) bits.push(false);
		else return { ok: false, reason: `block ${b} is ambiguous (mean luma ${luma.toFixed(1)})` };
	}
	const lead = bits.slice(0, LEADING_GUARD.length);
	const trail = bits.slice(bits.length - TRAILING_GUARD.length);
	if (
		lead.some((v, i) => v !== LEADING_GUARD[i]) ||
		trail.some((v, i) => v !== TRAILING_GUARD[i])
	) {
		return { ok: false, reason: "guard blocks do not match: no stamp at this position" };
	}
	let frame = 0;
	for (let i = 0; i < FRAME_STAMP_BITS; i++) {
		frame = (frame << 1) | (bits[LEADING_GUARD.length + i] ? 1 : 0);
	}
	let check = 0;
	for (let i = 0; i < CHECK_BITS; i++) {
		check = (check << 1) | (bits[LEADING_GUARD.length + FRAME_STAMP_BITS + i] ? 1 : 0);
	}
	if (check !== checksum(frame)) {
		return { ok: false, reason: `checksum mismatch for frame ${frame}` };
	}
	return { ok: true, frame };
}
