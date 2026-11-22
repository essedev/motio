import { assertSameSize, type RgbaImage } from "./image.js";

/** Side of the Gaussian window. */
export const SSIM_WINDOW = 11;
/** Standard deviation of the Gaussian window. */
export const SSIM_SIGMA = 1.5;

const K1 = 0.01;
const K2 = 0.03;
const L = 255;
const C1 = (K1 * L) ** 2;
const C2 = (K2 * L) ** 2;

function gaussianKernel(): Float64Array {
	const k = new Float64Array(SSIM_WINDOW);
	const half = (SSIM_WINDOW - 1) / 2;
	let sum = 0;
	for (let i = 0; i < SSIM_WINDOW; i++) {
		const v = Math.exp(-((i - half) ** 2) / (2 * SSIM_SIGMA * SSIM_SIGMA));
		k[i] = v;
		sum += v;
	}
	for (let i = 0; i < SSIM_WINDOW; i++) k[i] = (k[i] ?? 0) / sum;
	return k;
}

const KERNEL = gaussianKernel();

/** Luma with the Rec. 601 weights, as in the reference implementation's `rgb2gray`. */
function luma(img: RgbaImage): Float64Array {
	const out = new Float64Array(img.width * img.height);
	for (let p = 0, i = 0; p < out.length; p++, i += 4) {
		out[p] =
			0.299 * (img.data[i] ?? 0) + 0.587 * (img.data[i + 1] ?? 0) + 0.114 * (img.data[i + 2] ?? 0);
	}
	return out;
}

/** Separable "valid" convolution with the Gaussian window: output is (w - 10) x (h - 10). */
function blur(src: Float64Array, w: number, h: number): Float64Array {
	const ow = w - SSIM_WINDOW + 1;
	const oh = h - SSIM_WINDOW + 1;
	const tmp = new Float64Array(ow * h);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < ow; x++) {
			let s = 0;
			for (let k = 0; k < SSIM_WINDOW; k++) s += (KERNEL[k] ?? 0) * (src[y * w + x + k] ?? 0);
			tmp[y * ow + x] = s;
		}
	}
	const out = new Float64Array(ow * oh);
	for (let y = 0; y < oh; y++) {
		for (let x = 0; x < ow; x++) {
			let s = 0;
			for (let k = 0; k < SSIM_WINDOW; k++) s += (KERNEL[k] ?? 0) * (tmp[(y + k) * ow + x] ?? 0);
			out[y * ow + x] = s;
		}
	}
	return out;
}

/**
 * Mean structural similarity (Wang, Bovik, Sheikh and Simoncelli, 2004) on luma. Uses the
 * paper's parameters: an 11x11 Gaussian window with sigma 1.5, K1 = 0.01, K2 = 0.03, L = 255,
 * computed over the windows that fit entirely inside the image (no padding) and averaged.
 * Luma is computed with Rec. 601 weights; alpha is ignored. Both images must be at least 11x11.
 */
export function ssim(a: RgbaImage, b: RgbaImage): number {
	assertSameSize(a, b);
	const { width: w, height: h } = a;
	if (w < SSIM_WINDOW || h < SSIM_WINDOW) {
		throw new RangeError(
			`SSIM needs images of at least ${SSIM_WINDOW}x${SSIM_WINDOW}, got ${w}x${h}`,
		);
	}
	const x = luma(a);
	const y = luma(b);
	const xx = new Float64Array(x.length);
	const yy = new Float64Array(x.length);
	const xy = new Float64Array(x.length);
	for (let i = 0; i < x.length; i++) {
		const xi = x[i] ?? 0;
		const yi = y[i] ?? 0;
		xx[i] = xi * xi;
		yy[i] = yi * yi;
		xy[i] = xi * yi;
	}
	const muX = blur(x, w, h);
	const muY = blur(y, w, h);
	const sXX = blur(xx, w, h);
	const sYY = blur(yy, w, h);
	const sXY = blur(xy, w, h);
	let total = 0;
	for (let i = 0; i < muX.length; i++) {
		const mx = muX[i] ?? 0;
		const my = muY[i] ?? 0;
		const vx = (sXX[i] ?? 0) - mx * mx;
		const vy = (sYY[i] ?? 0) - my * my;
		const cxy = (sXY[i] ?? 0) - mx * my;
		total += ((2 * mx * my + C1) * (2 * cxy + C2)) / ((mx * mx + my * my + C1) * (vx + vy + C2));
	}
	return total / muX.length;
}
