import { crc32, deflateSync } from "node:zlib";

/** Encodes RGBA pixels as a PNG (8 bits per channel, colour type 6, filter 0 on every row). */
export function encodeRgbaPng(rgba: Uint8Array, width: number, height: number): Buffer {
	if (rgba.length !== width * height * 4) {
		throw new Error(`Expected ${width * height * 4} bytes of RGBA, got ${rgba.length}.`);
	}
	const stride = width * 4;
	const raw = Buffer.alloc((stride + 1) * height);
	for (let y = 0; y < height; y++) {
		raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
	}
	const chunk = (type: string, data: Buffer) => {
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(body));
		return Buffer.concat([length, body, crc]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header.set([8, 6, 0, 0, 0], 8);
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(raw)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}
