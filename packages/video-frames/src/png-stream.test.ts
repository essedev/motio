import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { splitPngStream, stripColourChunks } from "./png-stream.js";

const chunk = (type: string, data: Buffer) => {
	const head = Buffer.alloc(8);
	head.writeUInt32BE(data.length, 0);
	head.write(type, 4, "latin1");
	return Buffer.concat([head, data, Buffer.alloc(4)]);
};

/** A 1x1 RGB PNG with the given extra chunks before IDAT (CRCs are not checked here). */
const png = (extra: Buffer[]) => {
	const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		...extra,
		chunk("IDAT", deflateSync(Buffer.from([0, 10, 20, 30]))),
		chunk("IEND", Buffer.alloc(0)),
	]);
};

const types = (file: Buffer) => {
	const out: string[] = [];
	for (let p = 8; p < file.length; p += 12 + file.readUInt32BE(p)) {
		out.push(file.toString("latin1", p + 4, p + 8));
	}
	return out;
};

describe("stripColourChunks", () => {
	it("removes the colour tags FFmpeg writes and keeps everything else", () => {
		const tagged = png([
			chunk("pHYs", Buffer.alloc(9)),
			chunk("cICP", Buffer.from([1, 1, 0, 1])),
			chunk("cHRM", Buffer.alloc(32)),
			chunk("gAMA", Buffer.from([0, 0, 0xb1, 0x8f])),
		]);
		expect(types(tagged)).toEqual(["IHDR", "pHYs", "cICP", "cHRM", "gAMA", "IDAT", "IEND"]);
		expect(types(stripColourChunks(tagged))).toEqual(["IHDR", "pHYs", "IDAT", "IEND"]);
	});

	it("returns an untagged file unchanged and works on split streams", () => {
		const plain = png([]);
		expect(stripColourChunks(plain)).toBe(plain);
		const stream = Buffer.concat([png([chunk("sRGB", Buffer.from([0]))]), plain]);
		expect(splitPngStream(stream).map((f) => types(stripColourChunks(f)))).toEqual([
			["IHDR", "IDAT", "IEND"],
			["IHDR", "IDAT", "IEND"],
		]);
	});
});
