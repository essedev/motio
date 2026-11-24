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
	/** Blocks that jumped on their own, when a small element flickered (see `blockFlicker`). */
	blocks?: BlockFlicker;
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

/** `0-29` or `3, 5-7, 12`: ascending frames with consecutive runs folded into ranges. */
export function formatFrameList(frames: readonly number[]): string {
	const sorted = [...new Set(frames)].sort((a, b) => a - b);
	const parts: string[] = [];
	for (let i = 0; i < sorted.length; ) {
		let j = i;
		while (j + 1 < sorted.length && (sorted[j + 1] as number) === (sorted[j] as number) + 1) j++;
		parts.push(i === j ? `${sorted[i]}` : `${sorted[i]}-${sorted[j]}`);
		i = j + 1;
	}
	return parts.join(", ");
}

/** What the runs of `check determinism` were: order, concurrency, and the fresh-page reference. */
export interface DeterminismRunShape {
	order: "ascending" | "descending";
	concurrency: number | string;
	freshPage?: true;
}

/** Why frames differ, read from which runs disagree. */
export type DeterminismCause = "random" | "order" | "race" | "history" | "mixed";

const CAUSE_MESSAGES: Record<DeterminismCause, string> = {
	random:
		"Every run drew these frames differently: the pixels depend on something random or on the clock (Math.random(), Date.now(), performance.now(), an animation running on real time). Use random(seed) and derive motion from useCurrentFrame().",
	order:
		"Ascending and descending renders differ while the number of tabs does not matter: a frame depends on the frame rendered before it (state kept in a module variable, a ref or a cache between frames).",
	race: "One tab and several tabs disagree: a race, something that loads or finishes at a different moment in each run (a fetch, a font or an image not held with delayRender()).",
	history:
		"The runs agree with each other but not with a new page per frame: a frame depends on what its page rendered before (state carried between frames on the same page).",
	mixed:
		"The runs disagree in more than one way; mismatches in --json has the pixel hash of every run.",
};

function frameCause(
	hashes: readonly string[],
	runs: readonly DeterminismRunShape[],
): DeterminismCause {
	const fresh = runs.findIndex((run) => run.freshPage);
	const indexed = runs
		.map((run, index) => ({ run, hash: hashes[index] as string }))
		.filter((_, i) => i !== fresh);
	const distinct = new Set(indexed.map((r) => r.hash));
	if (fresh >= 0 && distinct.size === 1) return "history";
	if (distinct.size === indexed.length && indexed.length > 2) return "random";
	const agree = (filter: (run: DeterminismRunShape) => boolean) =>
		new Set(indexed.filter((r) => filter(r.run)).map((r) => r.hash)).size <= 1;
	const byOrder = agree((r) => r.order === "ascending") && agree((r) => r.order === "descending");
	if (byOrder) return "order";
	// The one-tab runs agree, so the disagreement comes with more tabs.
	if (agree((r) => r.concurrency === 1)) return "race";
	return "mixed";
}

/**
 * The likely cause of the mismatches, as the guide explains it: ascending against descending
 * means a frame depends on the previous one, one tab against several a race, every run
 * different something random or a clock.
 */
export function diagnoseMismatches(
	mismatches: readonly DeterminismMismatch[],
	runs: readonly DeterminismRunShape[],
): { cause: DeterminismCause; message: string } {
	const causes = new Set(mismatches.map((m) => frameCause(m.hashes, runs)));
	const cause: DeterminismCause =
		causes.size === 1 ? ([...causes][0] as DeterminismCause) : "mixed";
	return { cause, message: CAUSE_MESSAGES[cause] };
}

/** Side of the square blocks `blockFlicker` compares, in captured pixels. */
export const FLICKER_BLOCK_SIZE = 16;

/** The blocks of a frame that jumped away from both neighbours. */
export interface BlockFlicker {
	/** Number of blocks that jumped. */
	blocks: number;
	/** Bounding box of those blocks, in captured pixels. */
	region: { x: number; y: number; width: number; height: number };
	/** Largest difference of a jumping block from its neighbours, 0 to 1. */
	maxDiff: number;
}

/**
 * The frame difference without dilution: compares each block of `FLICKER_BLOCK_SIZE` pixels on
 * its own, so a small element that appears for one frame (a 20 px dot on a 1920x1080 frame
 * changes 0.02% of the mean) is caught. A block jumps when it differs from the same block of
 * both neighbours by more than `threshold` while the neighbours' block stays alike (the same
 * rule as `isFlicker`): content seen for exactly one frame, never steady motion such as a pan,
 * where the previous and next block differ more than either does from the current one.
 * Returns null when no block jumped.
 */
export function blockFlicker(
	previous: Uint8Array,
	current: Uint8Array,
	next: Uint8Array,
	width: number,
	height: number,
	options: FlickerOptions,
): BlockFlicker | null {
	const size = FLICKER_BLOCK_SIZE;
	let blocks = 0;
	let maxDiff = 0;
	let x0 = Number.POSITIVE_INFINITY;
	let y0 = Number.POSITIVE_INFINITY;
	let x1 = 0;
	let y1 = 0;
	for (let by = 0; by < height; by += size) {
		for (let bx = 0; bx < width; bx += size) {
			let toPrevious = 0;
			let toNext = 0;
			let neighbours = 0;
			const bottom = Math.min(by + size, height);
			const right = Math.min(bx + size, width);
			for (let y = by; y < bottom; y++) {
				for (let i = (y * width + bx) * 4, end = (y * width + right) * 4; i < end; i += 4) {
					for (let c = i; c < i + 3; c++) {
						const p = previous[c] as number;
						const v = current[c] as number;
						const n = next[c] as number;
						toPrevious += Math.abs(v - p);
						toNext += Math.abs(v - n);
						neighbours += Math.abs(p - n);
					}
				}
			}
			const scale = (bottom - by) * (right - bx) * 3 * 255;
			const diffPrevious = toPrevious / scale;
			const diffNext = toNext / scale;
			if (!isFlicker(diffPrevious, diffNext, neighbours / scale, options)) continue;
			blocks++;
			maxDiff = Math.max(maxDiff, Math.min(diffPrevious, diffNext));
			x0 = Math.min(x0, bx);
			y0 = Math.min(y0, by);
			x1 = Math.max(x1, right);
			y1 = Math.max(y1, bottom);
		}
	}
	if (blocks === 0) return null;
	return { blocks, region: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, maxDiff };
}

/** Block threshold for a `--threshold` meant for the whole frame: five times it, at most 0.9. */
export function blockThresholdFor(threshold: number): number {
	return Math.min(0.9, threshold * 5);
}
