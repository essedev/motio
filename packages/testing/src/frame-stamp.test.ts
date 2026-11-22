import { describe, expect, it } from "vitest";
import {
	decodeFrameStamp,
	FRAME_STAMP_BLOCKS,
	frameStampBits,
	frameStampBlocks,
	frameStampSize,
} from "./frame-stamp.js";

function draw(
	frame: number,
	width: number,
	height: number,
	options: { x?: number; y?: number; blockSize?: number } = {},
	noise = 0,
	background = 128,
): Uint8Array {
	const data = new Uint8Array(width * height * 4).fill(background);
	for (const b of frameStampBlocks(frame, options)) {
		for (let y = b.y; y < b.y + b.size; y++) {
			for (let x = b.x; x < b.x + b.size; x++) {
				const i = (y * width + x) * 4;
				// Deterministic pseudo-noise so the test is reproducible.
				const n = noise === 0 ? 0 : ((x * 31 + y * 17) % (2 * noise + 1)) - noise;
				const v = Math.min(255, Math.max(0, (b.on ? 255 : 0) + n));
				data[i] = v;
				data[i + 1] = v;
				data[i + 2] = v;
				data[i + 3] = 255;
			}
		}
	}
	return data;
}

describe("frame stamps", () => {
	it("round trips every frame in a sample across the 16-bit range", () => {
		const { width } = frameStampSize();
		for (const frame of [0, 1, 2, 15, 16, 255, 256, 1234, 2999, 40000, 65535]) {
			expect(decodeFrameStamp(draw(frame, width, 16), width, 16)).toEqual({ ok: true, frame });
		}
	});

	it("decodes at an offset with a custom block size and survives noise", () => {
		const opts = { x: 32, y: 48, blockSize: 8 };
		const data = draw(4321, 640, 360, opts, 60);
		expect(decodeFrameStamp(data, 640, 360, opts)).toEqual({ ok: true, frame: 4321 });
	});

	it("frames the data with guards and a checksum", () => {
		const bits = frameStampBits(0);
		expect(bits).toHaveLength(FRAME_STAMP_BLOCKS);
		expect(bits.slice(0, 2)).toEqual([true, false]);
		expect(bits.slice(-2)).toEqual([false, true]);
	});

	it("rejects a frame with a flipped data bit through the checksum", () => {
		const { width } = frameStampSize();
		const data = draw(100, width, 16);
		// Flip data bit 0 (block 2 + 15) to white.
		const block = frameStampBlocks(100)[2 + 15];
		if (!block) throw new Error("missing block");
		for (let y = 0; y < 16; y++) {
			for (let x = block.x; x < block.x + 16; x++)
				data.fill(255, (y * width + x) * 4, (y * width + x) * 4 + 3);
		}
		const result = decodeFrameStamp(data, width, 16);
		expect(result.ok).toBe(false);
	});

	it("reports a missing stamp and ambiguous blocks instead of guessing", () => {
		const { width } = frameStampSize();
		const blank = new Uint8Array(width * 16 * 4).fill(0);
		expect(decodeFrameStamp(blank, width, 16)).toMatchObject({ ok: false });
		const grey = new Uint8Array(width * 16 * 4).fill(128);
		expect(decodeFrameStamp(grey, width, 16)).toMatchObject({
			ok: false,
			reason: expect.stringContaining("ambiguous"),
		});
		expect(decodeFrameStamp(blank, 10, 10)).toMatchObject({ ok: false });
	});

	it("rejects frames outside the encodable range", () => {
		expect(() => frameStampBits(-1)).toThrow(RangeError);
		expect(() => frameStampBits(65536)).toThrow(RangeError);
		expect(() => frameStampBits(1.5)).toThrow(RangeError);
	});
});
