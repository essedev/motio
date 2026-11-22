/** An RGBA image: row-major, 4 bytes per pixel, straight (not premultiplied) alpha. */
export interface RgbaImage {
	width: number;
	height: number;
	data: Uint8Array;
}

/** Throws unless `a` and `b` have the same size and a buffer that matches it. */
export function assertSameSize(a: RgbaImage, b: RgbaImage): void {
	if (a.width !== b.width || a.height !== b.height) {
		throw new RangeError(`image sizes differ: ${a.width}x${a.height} and ${b.width}x${b.height}`);
	}
	for (const img of [a, b]) {
		if (img.data.length !== img.width * img.height * 4) {
			throw new RangeError(
				`buffer of ${img.data.length} bytes does not match ${img.width}x${img.height} RGBA`,
			);
		}
	}
}
