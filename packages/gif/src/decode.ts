// A GIF87a/GIF89a decoder written for Motio: parses the blocks, decompresses the LZW image data
// and composes every frame onto a full canvas following the disposal methods, so any frame can be
// shown on its own, in any order.
//
// Like the published @remotion/gif (recorded in __oracle__/gif.json), it is lenient: the signature
// is not checked, and data that ends early or holds an unknown block ends the GIF after the last
// complete frame instead of failing (a PNG decodes to no frames, a truncated GIF to its first
// frames).

/** A decoded GIF: one full RGBA canvas per frame, and how long each frame shows. */
export interface DecodedGif {
	width: number;
	height: number;
	/** Display time of each frame in milliseconds. */
	delays: number[];
	/** One RGBA buffer of `width * height * 4` bytes per frame, already composed. */
	frames: Uint8ClampedArray<ArrayBuffer>[];
}

interface RawFrame {
	x: number;
	y: number;
	width: number;
	height: number;
	interlaced: boolean;
	palette: Uint8Array;
	indices: Uint8Array;
	transparentIndex: number | null;
	disposal: number;
	delay: number;
}

/** Ends parsing: the data stops or turns into something the decoder cannot read. */
class EndOfGif extends Error {}

/**
 * Display time of a frame in milliseconds from its delay in hundredths of a second. A delay of 0
 * means "as fast as possible", which browsers and the published @remotion/gif show for 100 ms.
 */
export function frameDelay(hundredths: number): number {
	return hundredths === 0 ? 100 : hundredths * 10;
}

class Reader {
	position = 0;
	constructor(readonly bytes: Uint8Array) {}

	byte(): number {
		const value = this.bytes[this.position];
		if (value === undefined) throw new EndOfGif("The GIF data ends unexpectedly.");
		this.position++;
		return value;
	}

	u16(): number {
		return this.byte() | (this.byte() << 8);
	}

	take(length: number): Uint8Array {
		if (this.position + length > this.bytes.length) {
			throw new EndOfGif("The GIF data ends unexpectedly.");
		}
		const slice = this.bytes.subarray(this.position, this.position + length);
		this.position += length;
		return slice;
	}

	/**
	 * Concatenates data sub-blocks up to the block terminator. When the data ends first, returns
	 * what there is (a partial last block included) with `complete: false`.
	 */
	subBlocks(): { data: Uint8Array; complete: boolean } {
		const chunks: Uint8Array[] = [];
		let total = 0;
		let complete = true;
		for (;;) {
			const size = this.bytes[this.position];
			if (size === undefined) {
				complete = false;
				break;
			}
			this.position++;
			if (size === 0) break;
			const available = Math.min(size, this.bytes.length - this.position);
			chunks.push(this.bytes.subarray(this.position, this.position + available));
			this.position += available;
			total += available;
			if (available < size) {
				complete = false;
				break;
			}
		}
		const data = new Uint8Array(total);
		let offset = 0;
		for (const chunk of chunks) {
			data.set(chunk, offset);
			offset += chunk.length;
		}
		return { data, complete };
	}

	skipSubBlocks(): void {
		for (let size = this.byte(); size !== 0; size = this.byte()) this.take(size);
	}
}

/** Decompresses GIF LZW data into `pixelCount` palette indices (missing pixels stay 0). */
export function decompressLzw(
	data: Uint8Array,
	minCodeSize: number,
	pixelCount: number,
): Uint8Array {
	if (minCodeSize < 1 || minCodeSize > 11) {
		throw new EndOfGif(`Invalid LZW minimum code size ${minCodeSize}.`);
	}
	const out = new Uint8Array(pixelCount);
	const clear = 1 << minCodeSize;
	const end = clear + 1;
	// Each code is stored as its last byte, a link to its prefix code and its length.
	const prefix = new Int16Array(4096);
	const suffix = new Uint8Array(4096);
	const length = new Uint16Array(4096);
	for (let i = 0; i < clear; i++) {
		prefix[i] = -1;
		suffix[i] = i;
		length[i] = 1;
	}
	let codeSize = minCodeSize + 1;
	let next = end + 1;
	let previous = -1;
	let written = 0;
	let bits = 0;
	let bitCount = 0;
	let position = 0;

	const firstByte = (code: number): number => {
		let c = code;
		while (prefix[c] !== -1) c = prefix[c] as number;
		return suffix[c] as number;
	};
	const emit = (code: number) => {
		const size = length[code] as number;
		let c = code;
		for (let i = size - 1; i >= 0; i--) {
			const at = written + i;
			if (at < pixelCount) out[at] = suffix[c] as number;
			c = prefix[c] as number;
		}
		written += size;
	};

	while (written < pixelCount) {
		while (bitCount < codeSize) {
			if (position >= data.length) return out;
			bits |= (data[position++] as number) << bitCount;
			bitCount += 8;
		}
		const code = bits & ((1 << codeSize) - 1);
		bits >>>= codeSize;
		bitCount -= codeSize;
		if (code === clear) {
			codeSize = minCodeSize + 1;
			next = end + 1;
			previous = -1;
			continue;
		}
		if (code === end) break;
		if (previous === -1) {
			if (code >= clear) throw new EndOfGif("Invalid LZW code in the GIF data.");
			emit(code);
			previous = code;
			continue;
		}
		let first: number;
		if (code < next) {
			first = firstByte(code);
		} else if (code === next) {
			first = firstByte(previous);
		} else {
			throw new EndOfGif("Invalid LZW code in the GIF data.");
		}
		if (next < 4096) {
			prefix[next] = previous;
			suffix[next] = first;
			length[next] = (length[previous] as number) + 1;
			next++;
			if (next === 1 << codeSize && codeSize < 12) codeSize++;
		}
		emit(code);
		previous = code;
	}
	return out;
}

/** Reorders the rows of an interlaced image (passes start at 0, 4, 2, 1). */
function deinterlace(indices: Uint8Array, width: number, height: number): Uint8Array {
	const out = new Uint8Array(indices.length);
	let row = 0;
	for (const [start, step] of [
		[0, 8],
		[4, 8],
		[2, 4],
		[1, 2],
	] as const) {
		for (let y = start; y < height; y += step) {
			out.set(indices.subarray(row * width, (row + 1) * width), y * width);
			row++;
		}
	}
	return out;
}

function parse(bytes: Uint8Array): { width: number; height: number; frames: RawFrame[] } {
	const reader = new Reader(bytes);
	let width = 0;
	let height = 0;
	const frames: RawFrame[] = [];
	try {
		reader.take(6); // signature and version, not checked
		width = reader.u16();
		height = reader.u16();
		parseBlocks(reader, frames);
	} catch (error) {
		if (!(error instanceof EndOfGif)) throw error;
	}
	return { width, height, frames };
}

function parseBlocks(reader: Reader, frames: RawFrame[]): void {
	const bytes = reader.bytes;
	const packed = reader.byte();
	reader.byte(); // background colour index: frames are composed over transparency
	reader.byte(); // pixel aspect ratio
	const globalPalette = packed & 0x80 ? reader.take(3 * (1 << ((packed & 7) + 1))) : null;

	let transparentIndex: number | null = null;
	let disposal = 0;
	let delay = 0;
	for (;;) {
		const introducer = reader.position < bytes.length ? reader.byte() : 0x3b;
		if (introducer === 0x3b) break;
		if (introducer === 0x21) {
			const label = reader.byte();
			if (label === 0xf9) {
				const { data: block, complete } = reader.subBlocks();
				if (!complete) throw new EndOfGif("The GIF data ends unexpectedly.");
				const flags = block[0] ?? 0;
				disposal = (flags >> 2) & 7;
				delay = (block[1] ?? 0) | ((block[2] ?? 0) << 8);
				transparentIndex = flags & 1 ? (block[3] ?? 0) : null;
			} else {
				reader.skipSubBlocks();
			}
			continue;
		}
		if (introducer !== 0x2c) {
			throw new EndOfGif(`Unknown block 0x${introducer.toString(16)} in the GIF data.`);
		}
		const x = reader.u16();
		const y = reader.u16();
		const frameWidth = reader.u16();
		const frameHeight = reader.u16();
		const flags = reader.byte();
		const localPalette = flags & 0x80 ? reader.take(3 * (1 << ((flags & 7) + 1))) : null;
		const palette = localPalette ?? globalPalette;
		if (!palette) throw new EndOfGif("A GIF frame has no colour table.");
		const minCodeSize = reader.byte();
		const { data, complete } = reader.subBlocks();
		const interlaced = (flags & 0x40) !== 0;
		const decoded = decompressLzw(data, minCodeSize, frameWidth * frameHeight);
		frames.push({
			x,
			y,
			width: frameWidth,
			height: frameHeight,
			interlaced,
			palette,
			indices: interlaced ? deinterlace(decoded, frameWidth, frameHeight) : decoded,
			transparentIndex,
			disposal,
			delay,
		});
		// A frame cut short is kept with the pixels decoded so far, and ends the GIF.
		if (!complete) throw new EndOfGif("The GIF data ends unexpectedly.");
		transparentIndex = null;
		disposal = 0;
		delay = 0;
	}
}

/**
 * Decodes a GIF into full RGBA frames: each frame is drawn over the canvas left by the previous
 * one after that one's disposal (2 clears its rectangle to transparent, 3 restores the canvas from
 * before it); transparent pixels leave the canvas unchanged. The canvas starts transparent. Never
 * throws: unreadable data gives fewer frames, possibly none.
 */
export function decodeGif(data: ArrayBuffer | Uint8Array): DecodedGif {
	const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
	const { width, height, frames: raw } = parse(bytes);
	const canvas = new Uint8ClampedArray(width * height * 4);
	const frames: Uint8ClampedArray<ArrayBuffer>[] = [];
	const delays: number[] = [];
	let restore: Uint8ClampedArray | null = null;
	let previous: RawFrame | null = null;
	for (const frame of raw) {
		if (previous?.disposal === 2) {
			clearRect(canvas, width, height, previous);
		} else if (previous?.disposal === 3 && restore) {
			canvas.set(restore);
		}
		restore = frame.disposal === 3 ? canvas.slice() : null;
		draw(canvas, width, height, frame);
		frames.push(canvas.slice());
		delays.push(frameDelay(frame.delay));
		previous = frame;
	}
	return { width, height, delays, frames };
}

function clearRect(canvas: Uint8ClampedArray, width: number, height: number, frame: RawFrame) {
	const right = Math.min(frame.x + frame.width, width);
	const bottom = Math.min(frame.y + frame.height, height);
	for (let y = frame.y; y < bottom; y++) {
		canvas.fill(0, (y * width + frame.x) * 4, (y * width + right) * 4);
	}
}

function draw(canvas: Uint8ClampedArray, width: number, height: number, frame: RawFrame) {
	const { palette, indices, transparentIndex } = frame;
	const right = Math.min(frame.x + frame.width, width);
	const bottom = Math.min(frame.y + frame.height, height);
	for (let y = frame.y; y < bottom; y++) {
		let source = (y - frame.y) * frame.width;
		let target = (y * width + frame.x) * 4;
		for (let x = frame.x; x < right; x++, source++, target += 4) {
			const index = indices[source] as number;
			if (index === transparentIndex) continue;
			canvas[target] = palette[index * 3] ?? 0;
			canvas[target + 1] = palette[index * 3 + 1] ?? 0;
			canvas[target + 2] = palette[index * 3 + 2] ?? 0;
			canvas[target + 3] = 255;
		}
	}
}
