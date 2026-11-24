import { appendFileSync } from "node:fs";
import { assertSameSize, type RgbaImage } from "./image.js";

/** Side of the square blocks `blockDifference` compares, in pixels. */
export const DIFFERENCE_BLOCK_SIZE = 32;

/**
 * Largest mean absolute difference of one block that a render may show against Remotion's
 * reference, in code values (0 to 255, over R, G, B and A). Mean SSIM and PSNR average over the
 * whole frame, so a small area drawn very differently (a wrong glyph, a missing icon, a box in the
 * wrong place) passes them; this bounds every 32x32 block on its own.
 *
 * Calibrated on 2026-11-24 over the 472 Remotion comparisons that passed then (M1 PNG and JPEG
 * stills, templates, features, transitions with and without HTML-in-canvas, motion blur, GIF,
 * Lottie, Rive, starburst, Three, light leaks): the worst block was 7.08, the JPEG still of the 3D
 * flip over a transparent background (features, frame 85, JPEG artefacts on its edge, D-041); the
 * worst PNG block 2.29, the same flip; every other suite at most 0.94. 8 keeps them passing with a
 * small margin. A 10x10 px area changed by 200 on three channels averages 58 over its block.
 */
export const MAX_BLOCK_DIFFERENCE = 8;

/** The block of two images that differs most. */
export interface BlockDifference {
	/** Mean absolute difference of that block over R, G, B and A, 0 to 255. */
	max: number;
	/** Top-left corner of that block, in pixels. */
	x: number;
	y: number;
	size: number;
}

/**
 * Splits both images into blocks of `size` pixels (the last row and column may be smaller) and
 * returns the block with the largest mean absolute difference over R, G, B and A.
 */
export function blockDifference(
	a: RgbaImage,
	b: RgbaImage,
	size = DIFFERENCE_BLOCK_SIZE,
): BlockDifference {
	assertSameSize(a, b);
	let worst: BlockDifference = { max: 0, x: 0, y: 0, size };
	for (let by = 0; by < a.height; by += size) {
		const bottom = Math.min(by + size, a.height);
		for (let bx = 0; bx < a.width; bx += size) {
			const right = Math.min(bx + size, a.width);
			let sum = 0;
			for (let y = by; y < bottom; y++) {
				for (let i = (y * a.width + bx) * 4, end = (y * a.width + right) * 4; i < end; i++) {
					sum += Math.abs((a.data[i] as number) - (b.data[i] as number));
				}
			}
			const mean = sum / ((bottom - by) * (right - bx) * 4);
			if (mean > worst.max) worst = { max: mean, x: bx, y: by, size };
		}
	}
	return worst;
}

/** One line for an assertion message: the worst block and its difference. */
export function describeBlock(block: BlockDifference): string {
	return `block ${block.size}x${block.size} at ${block.x},${block.y} differs by ${block.max.toFixed(2)} code values on average (limit ${MAX_BLOCK_DIFFERENCE})`;
}

/**
 * Appends one comparison to the file named by `MOTIO_COMPARISON_LOG`, one JSON object per line,
 * when it is set: how the block threshold is calibrated across every Remotion comparison.
 */
export function logComparison(entry: {
	suite: string;
	id: string;
	frame: number;
	ssim: number;
	psnr: number;
	block: BlockDifference;
}): void {
	const file = process.env.MOTIO_COMPARISON_LOG;
	if (!file) return;
	appendFileSync(
		file,
		`${JSON.stringify({ ...entry, psnr: Number.isFinite(entry.psnr) ? entry.psnr : null })}\n`,
	);
}
