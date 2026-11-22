import { describe, expect, it } from "vitest";
import { encodeWav } from "./audio-buffer-to-data-url.js";
import { isReadableWav, parseWavHeader, readChannel } from "./wav.js";

function pcmWav(opts: {
	channels: number;
	rate: number;
	bits: number;
	format?: number;
	extensible?: boolean;
	frames: number[][];
	list?: number;
}) {
	const { channels, rate, bits, frames } = opts;
	const bytesPerSample = bits / 8;
	const data = new Uint8Array(frames.length * channels * bytesPerSample);
	const dv = new DataView(data.buffer);
	frames.forEach((frame, i) => {
		frame.forEach((v, c) => {
			const at = (i * channels + c) * bytesPerSample;
			if (opts.format === 3) dv.setFloat32(at, v, true);
			else if (bits === 16) dv.setInt16(at, v, true);
			else if (bits === 24) {
				dv.setUint8(at, v & 0xff);
				dv.setUint8(at + 1, (v >> 8) & 0xff);
				dv.setInt8(at + 2, v >> 16);
			} else if (bits === 8) dv.setUint8(at, v);
			else dv.setInt32(at, v, true);
		});
	});
	const fmtSize = opts.extensible ? 40 : 16;
	const list = opts.list ?? 0;
	const header = new Uint8Array(12 + 8 + fmtSize + (list ? 8 + list : 0) + 8);
	const h = new DataView(header.buffer);
	const ascii = (at: number, s: string) => {
		for (let i = 0; i < s.length; i++) h.setUint8(at + i, s.charCodeAt(i));
	};
	ascii(0, "RIFF");
	h.setUint32(4, header.length - 8 + data.length, true);
	ascii(8, "WAVE");
	ascii(12, "fmt ");
	h.setUint32(16, fmtSize, true);
	h.setUint16(20, opts.extensible ? 0xfffe : (opts.format ?? 1), true);
	h.setUint16(22, channels, true);
	h.setUint32(24, rate, true);
	h.setUint32(28, rate * channels * bytesPerSample, true);
	h.setUint16(32, channels * bytesPerSample, true);
	h.setUint16(34, bits, true);
	if (opts.extensible) h.setUint16(20 + 24, opts.format ?? 1, true);
	let at = 20 + fmtSize;
	if (list) {
		ascii(at, "LIST");
		h.setUint32(at + 4, list, true);
		at += 8 + list;
	}
	ascii(at, "data");
	h.setUint32(at + 4, data.length, true);
	const out = new Uint8Array(header.length + data.length);
	out.set(header);
	out.set(data, header.length);
	return out;
}

describe("parseWavHeader and readChannel", () => {
	it("reads 16-bit stereo PCM per channel", () => {
		const file = pcmWav({
			channels: 2,
			rate: 22050,
			bits: 16,
			frames: [
				[0, -32768],
				[16384, 32767],
				[-1, 1],
			],
		});
		const info = parseWavHeader(file, file.length);
		expect(info).toMatchObject({
			format: 1,
			numberOfChannels: 2,
			sampleRate: 22050,
			bitsPerSample: 16,
			dataOffset: 44,
			frames: 3,
		});
		if (info === null || info === "incomplete") throw new Error("unreachable");
		const data = file.subarray(info.dataOffset);
		expect(Array.from(readChannel(info, data, 0))).toEqual([0, 0.5, -1 / 32768]);
		expect(Array.from(readChannel(info, data, 1))).toEqual([-1, 32767 / 32768, 1 / 32768]);
	});

	it("reads 24-bit, 8-bit and extensible float data, skipping other chunks", () => {
		const w24 = pcmWav({
			channels: 1,
			rate: 48000,
			bits: 24,
			frames: [[-8388608], [4194304]],
			list: 10,
		});
		const i24 = parseWavHeader(w24, w24.length);
		if (i24 === null || i24 === "incomplete") throw new Error("unreachable");
		expect(Array.from(readChannel(i24, w24.subarray(i24.dataOffset), 0))).toEqual([-1, 0.5]);
		const w8 = pcmWav({ channels: 1, rate: 8000, bits: 8, frames: [[0], [128], [192]] });
		const i8 = parseWavHeader(w8, w8.length);
		if (i8 === null || i8 === "incomplete") throw new Error("unreachable");
		expect(Array.from(readChannel(i8, w8.subarray(i8.dataOffset), 0))).toEqual([-1, 0, 0.5]);
		const wf = pcmWav({
			channels: 1,
			rate: 44100,
			bits: 32,
			format: 3,
			extensible: true,
			frames: [[0.25], [-2]],
		});
		const iF = parseWavHeader(wf, wf.length);
		if (iF === null || iF === "incomplete") throw new Error("unreachable");
		expect(iF.format).toBe(3);
		expect(isReadableWav(iF)).toBe(true);
		expect(Array.from(readChannel(iF, wf.subarray(iF.dataOffset), 0))).toEqual([0.25, -2]);
	});

	it("bounds the data chunk by the file size and reports truncated headers", () => {
		const file = pcmWav({ channels: 1, rate: 8000, bits: 16, frames: [[1], [2], [3], [4]] });
		new DataView(file.buffer).setUint32(40, 0xffffffff, true);
		expect(parseWavHeader(file, file.length)).toMatchObject({ frames: 4 });
		expect(parseWavHeader(file.subarray(0, 30), file.length)).toBe("incomplete");
		expect(parseWavHeader(new TextEncoder().encode("ID3 not a wav file"), 100)).toBeNull();
	});

	it("parses what audioBufferToDataUrl encodes", () => {
		const channels = [Float32Array.of(0.1, -0.2), Float32Array.of(1.5, -1.5)];
		const bytes = encodeWav({
			numberOfChannels: 2,
			length: 2,
			sampleRate: 32000,
			getChannelData: (c) => channels[c] as Float32Array,
		});
		const info = parseWavHeader(bytes, bytes.length);
		if (info === null || info === "incomplete") throw new Error("unreachable");
		expect(info).toMatchObject({
			format: 3,
			numberOfChannels: 2,
			sampleRate: 32000,
			bitsPerSample: 32,
			frames: 2,
		});
		expect(readChannel(info, bytes.subarray(info.dataOffset), 1)).toEqual(channels[1]);
	});
});
