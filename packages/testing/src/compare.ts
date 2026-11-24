import { type BlockDifference, blockDifference, logComparison } from "./block-difference.js";
import type { RgbaImage } from "./image.js";
import { psnr } from "./psnr.js";
import { ssim } from "./ssim.js";

/** How a render compares with Remotion's reference still. */
export interface Comparison {
	ssim: number;
	psnr: number;
	/** The block that differs most (see `blockDifference`). */
	block: BlockDifference;
}

/**
 * SSIM, PSNR and the most different block of a render against Remotion's reference, logged for the
 * block threshold's calibration when `MOTIO_COMPARISON_LOG` is set.
 */
export function compareImages(
	suite: string,
	id: string,
	frame: number,
	ours: RgbaImage,
	ref: RgbaImage,
): Comparison {
	const result = {
		ssim: ssim(ours, ref),
		psnr: psnr(ours, ref),
		block: blockDifference(ours, ref),
	};
	logComparison({ suite, id, frame, ...result });
	return result;
}
