import { assertSameSize, type RgbaImage } from "./image.js";

/**
 * Peak signal-to-noise ratio in dB over the R, G and B channels (alpha ignored), with a peak of
 * 255. Returns `Infinity` for identical images.
 */
export function psnr(a: RgbaImage, b: RgbaImage): number {
	assertSameSize(a, b);
	let sum = 0;
	const n = a.width * a.height;
	for (let i = 0; i < n * 4; i += 4) {
		for (let c = 0; c < 3; c++) {
			const d = (a.data[i + c] ?? 0) - (b.data[i + c] ?? 0);
			sum += d * d;
		}
	}
	const mse = sum / (n * 3);
	return mse === 0 ? Number.POSITIVE_INFINITY : 10 * Math.log10((255 * 255) / mse);
}
