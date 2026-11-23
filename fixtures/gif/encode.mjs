// GIF89a encoder shared by generate.mjs and the oracle recorders (tools/oracle-features): LZW,
// global and local palettes, transparency, disposal methods, interlacing, NETSCAPE looping.

/** LZW-compresses palette indices into GIF image data sub-blocks. */
function lzw(indices, minCodeSize) {
	const clear = 1 << minCodeSize;
	const end = clear + 1;
	const bytes = [];
	let bitBuffer = 0;
	let bitCount = 0;
	let codeSize = minCodeSize + 1;
	const emit = (code) => {
		bitBuffer |= code << bitCount;
		bitCount += codeSize;
		while (bitCount >= 8) {
			bytes.push(bitBuffer & 0xff);
			bitBuffer >>= 8;
			bitCount -= 8;
		}
	};
	let table = new Map();
	let next = end + 1;
	const reset = () => {
		table = new Map();
		next = end + 1;
		codeSize = minCodeSize + 1;
	};
	emit(clear);
	let prefix = indices[0];
	for (let i = 1; i < indices.length; i++) {
		const k = indices[i];
		const key = prefix * 4096 + k;
		const found = table.get(key);
		if (found !== undefined) {
			prefix = found;
			continue;
		}
		emit(prefix);
		if (next < 4096) {
			table.set(key, next++);
			if (next > 1 << codeSize && codeSize < 12) codeSize++;
		} else {
			emit(clear);
			reset();
		}
		prefix = k;
	}
	emit(prefix);
	emit(end);
	if (bitCount > 0) bytes.push(bitBuffer & 0xff);
	const out = [minCodeSize];
	for (let i = 0; i < bytes.length; i += 255) {
		const chunk = bytes.slice(i, i + 255);
		out.push(chunk.length, ...chunk);
	}
	out.push(0);
	return out;
}

const u16 = (n) => [n & 0xff, (n >> 8) & 0xff];
/** Palette padded to a power of two (at least 2 entries); returns bytes and the size field. */
function palette(colors) {
	let bits = 1;
	while (1 << bits < colors.length) bits++;
	const bytes = [];
	for (let i = 0; i < 1 << bits; i++) bytes.push(...(colors[i] ?? [0, 0, 0]));
	return { bytes, field: bits - 1, bits };
}

function interlace(indices, width, height) {
	const rows = [];
	for (const [start, step] of [
		[0, 8],
		[4, 8],
		[2, 4],
		[1, 2],
	]) {
		for (let y = start; y < height; y += step) rows.push(y);
	}
	return rows.flatMap((y) => indices.slice(y * width, (y + 1) * width));
}

/**
 * Encodes a GIF. frames: { x, y, width, height, indices, delay (hundredths), disposal (0-3),
 * transparent (index or undefined), colors (local palette or undefined), interlaced, noControl
 * (no graphic control extension: no delay, disposal or transparency) }.
 */
export function encode({ width, height, colors, background = 0, loop = 0, frames }) {
	const global = palette(colors);
	const out = [...Buffer.from("GIF89a"), ...u16(width), ...u16(height)];
	out.push(0x80 | ((global.bits - 1) << 4) | global.field, background, 0, ...global.bytes);
	if (loop !== undefined) {
		out.push(0x21, 0xff, 11, ...Buffer.from("NETSCAPE2.0"), 3, 1, ...u16(loop), 0);
	}
	for (const f of frames) {
		const hasTransparency = f.transparent !== undefined;
		if (!f.noControl) {
			out.push(0x21, 0xf9, 4, (f.disposal << 2) | (hasTransparency ? 1 : 0), ...u16(f.delay));
			out.push(hasTransparency ? f.transparent : 0, 0);
		}
		const local = f.colors ? palette(f.colors) : undefined;
		let packed = 0;
		if (local) packed |= 0x80 | local.field;
		if (f.interlaced) packed |= 0x40;
		out.push(0x2c, ...u16(f.x), ...u16(f.y), ...u16(f.width), ...u16(f.height), packed);
		if (local) out.push(...local.bytes);
		const indices = f.interlaced ? interlace(f.indices, f.width, f.height) : f.indices;
		out.push(...lzw(indices, Math.max(2, (local ?? global).bits)));
	}
	out.push(0x3b);
	return Buffer.from(out);
}

/** Indices of a width x height image from a function of (x, y). */
export const image = (width, height, fn) => {
	const indices = [];
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) indices.push(fn(x, y));
	return indices;
};
