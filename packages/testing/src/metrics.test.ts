import { describe, expect, it } from "vitest";
import type { RgbaImage } from "./image.js";
import { psnr } from "./psnr.js";
import { ssim } from "./ssim.js";

function solid(width: number, height: number, v: number): RgbaImage {
	const data = new Uint8Array(width * height * 4).fill(v);
	for (let i = 3; i < data.length; i += 4) data[i] = 255;
	return { width, height, data };
}

function pattern(width: number, height: number, seed: number): RgbaImage {
	const img = solid(width, height, 0);
	let s = seed;
	for (let i = 0; i < width * height; i++) {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		const v = s % 256;
		img.data.fill(v, i * 4, i * 4 + 3);
	}
	return img;
}

describe("psnr", () => {
	it("is infinite for identical images", () => {
		const a = pattern(32, 32, 1);
		expect(psnr(a, a)).toBe(Number.POSITIVE_INFINITY);
	});

	it("equals 20 log10(255) for an error of one code value everywhere", () => {
		expect(psnr(solid(16, 16, 100), solid(16, 16, 101))).toBeCloseTo(20 * Math.log10(255), 10);
	});

	it("ignores alpha", () => {
		const a = solid(8, 8, 50);
		const b = solid(8, 8, 50);
		b.data[3] = 0;
		expect(psnr(a, b)).toBe(Number.POSITIVE_INFINITY);
	});

	it("rejects images of different sizes", () => {
		expect(() => psnr(solid(8, 8, 0), solid(8, 9, 0))).toThrow(RangeError);
	});
});

describe("ssim", () => {
	it("is 1 for identical images", () => {
		const a = pattern(40, 30, 7);
		expect(ssim(a, a)).toBeCloseTo(1, 12);
	});

	it("matches the closed form for two flat images", () => {
		// Zero variance: SSIM = (2ab + C1) / (a^2 + b^2 + C1), with C1 = (0.01 * 255)^2.
		const c1 = (0.01 * 255) ** 2;
		const expected = (2 * 100 * 140 + c1) / (100 * 100 + 140 * 140 + c1);
		expect(ssim(solid(20, 20, 100), solid(20, 20, 140))).toBeCloseTo(expected, 10);
	});

	it("is close to 0 for unrelated noise and decreases with distortion", () => {
		const a = pattern(64, 64, 3);
		const b = pattern(64, 64, 99);
		expect(Math.abs(ssim(a, b))).toBeLessThan(0.05);
		const slight: RgbaImage = {
			...a,
			data: a.data.map((v, i) => (i % 4 === 3 ? v : Math.min(255, v + ((i * 7) % 5)))),
		};
		const s = ssim(a, slight);
		expect(s).toBeLessThan(1);
		expect(s).toBeGreaterThan(0.95);
	});

	it("rejects images smaller than the window", () => {
		expect(() => ssim(solid(10, 20, 0), solid(10, 20, 0))).toThrow(RangeError);
	});
});
