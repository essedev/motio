import { createHash } from "node:crypto";

/** SHA-256 of decoded RGBA pixels: determinism is judged on pixels, never on encoded bytes. */
export function hashPixels(rgba: Uint8Array): string {
	return createHash("sha256").update(rgba).digest("hex");
}

/**
 * Mean absolute difference of the RGB channels, from 0 (identical) to 1 (black against white).
 * Alpha is ignored: flicker is about what is seen.
 */
export function meanAbsoluteDifference(a: Uint8Array, b: Uint8Array): number {
	if (a.length !== b.length || a.length % 4 !== 0) {
		throw new Error(
			`Cannot compare frames of different sizes (${a.length} and ${b.length} bytes).`,
		);
	}
	let sum = 0;
	for (let i = 0; i < a.length; i += 4) {
		sum +=
			Math.abs((a[i] as number) - (b[i] as number)) +
			Math.abs((a[i + 1] as number) - (b[i + 1] as number)) +
			Math.abs((a[i + 2] as number) - (b[i + 2] as number));
	}
	return sum / ((a.length / 4) * 3 * 255);
}

export interface DeterminismMismatch {
	frame: number;
	/** Hash of the frame in each run, in run order. */
	hashes: string[];
}

/** Frames whose hash differs between runs. Every run must contain the same frames. */
export function compareRuns(
	runs: ReadonlyArray<ReadonlyMap<number, string>>,
): DeterminismMismatch[] {
	const [first, ...others] = runs;
	if (!first) return [];
	const mismatches: DeterminismMismatch[] = [];
	for (const frame of [...first.keys()].sort((a, b) => a - b)) {
		const hashes = runs.map((run) => run.get(frame) ?? "missing");
		if (others.some((_, index) => hashes[index + 1] !== hashes[0]))
			mismatches.push({ frame, hashes });
	}
	return mismatches;
}

export interface FlickerOptions {
	/** Minimum difference from each neighbour (0 to 1). */
	threshold: number;
	/**
	 * The neighbours must be closer to each other than this share of the smaller jump, so a
	 * frame inside fast but steady motion is not flagged. 0.5 by default.
	 */
	neighbourRatio?: number;
}

export interface FlickerFrame {
	frame: number;
	diffPrevious: number;
	diffNext: number;
	/** Difference between the previous and the next frame. */
	diffNeighbours: number;
}

/**
 * Flags a frame that differs from both neighbours by more than `threshold` while the
 * neighbours resemble each other: a one-frame glitch rather than motion.
 */
export function isFlicker(
	diffPrevious: number,
	diffNext: number,
	diffNeighbours: number,
	options: FlickerOptions,
): boolean {
	const ratio = options.neighbourRatio ?? 0.5;
	return (
		diffPrevious > options.threshold &&
		diffNext > options.threshold &&
		diffNeighbours < ratio * Math.min(diffPrevious, diffNext)
	);
}

/** Reads the width and height from a PNG's IHDR chunk. */
export function pngSize(buffer: Uint8Array): { width: number; height: number } {
	const signature = [137, 80, 78, 71, 13, 10, 26, 10];
	if (buffer.length < 24 || signature.some((byte, i) => buffer[i] !== byte)) {
		throw new Error("Not a PNG image.");
	}
	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	return { width: view.getUint32(16), height: view.getUint32(20) };
}
