/**
 * In-place iterative radix-2 complex FFT (forward, unnormalized). `re` and `im` must have the same
 * power-of-two length.
 */
export function fft(re: Float64Array, im: Float64Array): void {
	const n = re.length;
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			const tr = re[i] as number;
			re[i] = re[j] as number;
			re[j] = tr;
			const ti = im[i] as number;
			im[i] = im[j] as number;
			im[j] = ti;
		}
	}
	for (let size = 2; size <= n; size <<= 1) {
		const half = size >> 1;
		const step = (-2 * Math.PI) / size;
		for (let k = 0; k < half; k++) {
			const wr = Math.cos(step * k);
			const wi = Math.sin(step * k);
			for (let start = 0; start < n; start += size) {
				const a = start + k;
				const b = a + half;
				const br = re[b] as number;
				const bi = im[b] as number;
				const vr = br * wr - bi * wi;
				const vi = br * wi + bi * wr;
				const ar = re[a] as number;
				const ai = im[a] as number;
				re[a] = ar + vr;
				im[a] = ai + vi;
				re[b] = ar - vr;
				im[b] = ai - vi;
			}
		}
	}
}
