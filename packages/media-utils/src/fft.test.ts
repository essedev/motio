import { describe, expect, it } from "vitest";
import { fft } from "./fft.js";

function dft(input: number[]): { re: number[]; im: number[] } {
	const n = input.length;
	const re: number[] = [];
	const im: number[] = [];
	for (let k = 0; k < n; k++) {
		let r = 0;
		let i = 0;
		for (let t = 0; t < n; t++) {
			const a = (-2 * Math.PI * k * t) / n;
			r += (input[t] as number) * Math.cos(a);
			i += (input[t] as number) * Math.sin(a);
		}
		re.push(r);
		im.push(i);
	}
	return { re, im };
}

describe("fft", () => {
	it("matches a direct DFT for every power of two up to 256", () => {
		let seed = 1;
		const rnd = () => {
			seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
			return seed / 4294967296 - 0.5;
		};
		for (let n = 1; n <= 256; n *= 2) {
			const input = Array.from({ length: n }, rnd);
			const re = Float64Array.from(input);
			const im = new Float64Array(n);
			fft(re, im);
			const expected = dft(input);
			for (let k = 0; k < n; k++) {
				expect(re[k]).toBeCloseTo(expected.re[k] as number, 9);
				expect(im[k]).toBeCloseTo(expected.im[k] as number, 9);
			}
		}
	});

	it("puts a pure cosine in its bin and the mirrored bin", () => {
		const n = 16;
		const re = Float64Array.from({ length: n }, (_, t) => Math.cos((2 * Math.PI * 3 * t) / n));
		const im = new Float64Array(n);
		fft(re, im);
		const magnitudes = Array.from(re, (r, k) => Math.hypot(r, im[k] as number));
		expect(magnitudes[3]).toBeCloseTo(8, 12);
		expect(magnitudes[13]).toBeCloseTo(8, 12);
		expect(magnitudes.filter((m) => m > 1e-9)).toHaveLength(2);
	});
});
