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
	/** Most pixels any run changed against the first run, when the frames were compared. */
	differingPixels?: number;
	/** Bounding box of the pixels that differ in any run, in captured pixels. */
	region?: Rect;
	/**
	 * Of the `differingPixels` of the run that changed most, those whose every channel differs by
	 * at most `FAINT_LEVELS`.
	 */
	faintPixels?: number;
	/**
	 * Of the `differingPixels` of the run that changed most, those inside an `<img>` drawn smaller
	 * than its natural size, when the images were located.
	 */
	imagePixels?: number;
}

/** Largest channel difference, in levels of 255, of a pixel that counts as faint. */
export const FAINT_LEVELS = 2;

/** Where two decoded RGBA frames of the same size differ. */
export interface PixelDifference {
	/** Pixels with at least one channel different. */
	pixels: number;
	/** Bounding box of those pixels. */
	region: Rect;
	/** Of those pixels, the ones whose every channel differs by at most `FAINT_LEVELS`. */
	faint: number;
	/** Of those pixels, the ones inside any of the `inside` rectangles (one pixel of margin). */
	inside: number;
}

/** The pixels where two decoded RGBA frames differ, or null when they are identical. */
export function pixelDifference(
	a: Uint8Array,
	b: Uint8Array,
	width: number,
	inside: readonly Rect[] = [],
): PixelDifference | null {
	if (a.length !== b.length || a.length % 4 !== 0) {
		throw new Error(
			`Cannot compare frames of different sizes (${a.length} and ${b.length} bytes).`,
		);
	}
	let pixels = 0;
	let faint = 0;
	let within = 0;
	let x0 = Number.POSITIVE_INFINITY;
	let y0 = Number.POSITIVE_INFINITY;
	let x1 = -1;
	let y1 = -1;
	for (let i = 0; i < a.length; i += 4) {
		if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3])
			continue;
		pixels++;
		const p = i / 4;
		const x = p % width;
		const y = (p - x) / width;
		if (x < x0) x0 = x;
		if (x > x1) x1 = x;
		if (y < y0) y0 = y;
		if (y > y1) y1 = y;
		let most = 0;
		for (let c = i; c < i + 4; c++)
			most = Math.max(most, Math.abs((a[c] as number) - (b[c] as number)));
		if (most <= FAINT_LEVELS) faint++;
		if (
			inside.some((r) => x >= r.x - 1 && x <= r.x + r.width && y >= r.y - 1 && y <= r.y + r.height)
		)
			within++;
	}
	if (pixels === 0) return null;
	return {
		pixels,
		region: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 },
		faint,
		inside: within,
	};
}

/** Bounding box of two regions. */
export function unionRegion(a: Rect | undefined, b: Rect): Rect {
	if (!a) return b;
	const x = Math.min(a.x, b.x);
	const y = Math.min(a.y, b.y);
	return {
		x,
		y,
		width: Math.max(a.x + a.width, b.x + b.width) - x,
		height: Math.max(a.y + a.height, b.y + b.height) - y,
	};
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

/** Why frames differ, read from which runs disagree and from how much of each frame differs. */
export type DeterminismCause =
	| "random"
	| "order"
	| "race"
	| "history"
	| "mixed"
	| "raster"
	| "canvas"
	| "image";

/** What the pattern of disagreeing runs points to, whatever the size of the differences. */
export type DeterminismPattern = Exclude<DeterminismCause, "raster" | "canvas" | "image">;

/**
 * Share of a frame's differing pixels that must lie inside downscaled images, and share that must
 * be faint (`FAINT_LEVELS`), for the differences to read as Chrome's image decode cache (D-091):
 * measured at 0.84 to 0.98 faint on the M4 photos, the rest at the photos' edges.
 */
export const IMAGE_INSIDE_SHARE = 0.9;
export const IMAGE_FAINT_SHARE = 0.75;

/**
 * Most differing pixels a frame may have, in lines of the longer side, for the differences to
 * read as rasterisation rather than content: an antialiased edge rasterised differently changes
 * about one line of pixels, content drawn differently usually far more.
 */
export const RASTER_LINES = 4;

const CAUSE_MESSAGES: Record<DeterminismPattern, string> = {
	random:
		"Every run drew these frames differently: the pixels probably depend on something random or on the clock (Math.random(), Date.now(), performance.now(), an animation running on real time). Use random(seed) and derive motion from useCurrentFrame().",
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
): DeterminismPattern {
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

/** Size of the captured frames, to judge how much of a frame differs. */
export interface FrameSize {
	width: number;
	height: number;
}

/**
 * The likely cause of the mismatches, with the run pattern when the cause is `raster`, `canvas`
 * or `image`.
 */
export interface DeterminismDiagnosis {
	cause: DeterminismCause;
	message: string;
	/** What the disagreeing runs point to, when `cause` is `raster`, `canvas` or `image`. */
	pattern?: DeterminismPattern;
	/**
	 * Set when the runs used the frame model and the pages reported code running on the real
	 * clock: the virtual time model replays that code on the video's time.
	 */
	timeModel?: { suggested: "virtual"; evidence: string[] };
}

/**
 * Page warnings that show code running on the real clock, whose pixels the virtual time model
 * makes deterministic, with how the hint names them.
 */
export const CLOCK_EVIDENCE: Readonly<Record<string, string>> = {
	W_ANIMATION_FRAME_LOOP: "a requestAnimationFrame loop",
	W_TIMER_LOOP: "a timer loop",
	W_MATH_RANDOM: "Math.random()",
};

/**
 * Adds the virtual time model to a diagnosis when the runs used the frame model and the pages
 * reported code running on the real clock (`CLOCK_EVIDENCE`); returns the diagnosis unchanged
 * otherwise. The cause stays the one the run pattern gives: the hint names a remedy, not a cause.
 */
export function withTimeModelHint(
	diagnosis: DeterminismDiagnosis,
	timeModel: "frame" | "virtual",
	warningCodes: ReadonlySet<string>,
): DeterminismDiagnosis {
	if (timeModel !== "frame") return diagnosis;
	const evidence = Object.keys(CLOCK_EVIDENCE).filter((code) => warningCodes.has(code));
	if (evidence.length === 0) return diagnosis;
	const named = evidence.map((code) => CLOCK_EVIDENCE[code]).join(" and ");
	return {
		...diagnosis,
		timeModel: { suggested: "virtual", evidence },
		message: `${diagnosis.message} The pages ran code on the real clock (${named}). Code you cannot drive from useCurrentFrame(), such as a library with its own timeline, renders the same on every run in the virtual time model: --time-model=virtual, or timeModel="virtual" on the <Composition>; check it with --time-model=virtual --reference=fresh.`,
	};
}

/**
 * Canvases drawn on the GPU during the runs (`canvas: "gpu"`): where each frame's canvases were,
 * in captured pixels. Differences that all lie inside them point to Chrome's GPU canvas.
 */
export interface GpuCanvases {
	regions: ReadonlyMap<number, readonly Rect[]>;
}

/** Whether `inner` lies inside `outer`, allowing one pixel of antialiasing around it. */
function within(inner: Rect, outer: Rect): boolean {
	return (
		inner.x >= outer.x - 1 &&
		inner.y >= outer.y - 1 &&
		inner.x + inner.width <= outer.x + outer.width + 1 &&
		inner.y + inner.height <= outer.y + outer.height + 1
	);
}

/**
 * The likely cause of the mismatches, as the guide explains it: ascending against descending
 * means a frame depends on the previous one, one tab against several a race, every run
 * different something random or a clock. When every frame differs in no more than a few lines of
 * pixels (`RASTER_LINES`), the likelier cause is Chrome rasterising the same content differently
 * (antialiased edges of moving elements), which no run pattern tells apart from randomness: the
 * message says so, and names the pattern as the alternative.
 */
export function diagnoseMismatches(
	mismatches: readonly DeterminismMismatch[],
	runs: readonly DeterminismRunShape[],
	size?: FrameSize,
	gpuCanvases?: GpuCanvases,
): DeterminismDiagnosis {
	const causes = new Set(mismatches.map((m) => frameCause(m.hashes, runs)));
	const pattern: DeterminismPattern =
		causes.size === 1 ? ([...causes][0] as DeterminismPattern) : "mixed";
	const inCanvases =
		gpuCanvases !== undefined &&
		mismatches.length > 0 &&
		mismatches.every((m) => {
			const region = m.region;
			return (
				region !== undefined &&
				(gpuCanvases.regions.get(m.frame) ?? []).some((canvas) => within(region, canvas))
			);
		});
	if (inCanvases) {
		return {
			cause: "canvas",
			pattern,
			message: `Every difference lies inside a <canvas>, and canvases were drawn on the GPU (canvas "gpu"): Chrome's GPU-accelerated 2D canvas can draw differently when the machine is loaded. Render with --canvas=software (browser.canvas in motio.config.ts), Motio's default, which measured deterministic under load; only transparent captures change. If the canvas content itself changes between runs, the pattern points to this: ${CAUSE_MESSAGES[pattern]}`,
		};
	}
	const inImages =
		mismatches.length > 0 &&
		mismatches.every(
			(m) =>
				m.differingPixels !== undefined &&
				m.differingPixels > 0 &&
				m.imagePixels !== undefined &&
				m.faintPixels !== undefined &&
				m.imagePixels >= IMAGE_INSIDE_SHARE * m.differingPixels &&
				m.faintPixels >= IMAGE_FAINT_SHARE * m.differingPixels,
		);
	if (inImages) {
		return {
			cause: "image",
			pattern,
			message: `The differences lie inside images drawn smaller than their natural size, and almost every differing pixel changes by at most ${FAINT_LEVELS} levels: Chrome draws a downscaled image from whichever decoded copy of it its image cache holds (one decoded at another size in an earlier frame, or a new one), and the copies differ by a level here and there, so a page that drew the image at other sizes before can differ from a new page. The cache lives inside Chrome's compositor and nothing outside the page can clear it between frames; the composition is not at fault and a video shows no visible change. If an image itself changes between runs (a different photo, a fade that depends on time), the pattern points to this: ${CAUSE_MESSAGES[pattern]}`,
		};
	}
	const limit = size ? RASTER_LINES * Math.max(size.width, size.height) : 0;
	const thin =
		size !== undefined &&
		mismatches.length > 0 &&
		mismatches.every((m) => m.differingPixels !== undefined && m.differingPixels <= limit);
	if (!thin) return { cause: pattern, message: CAUSE_MESSAGES[pattern] };
	const most = Math.max(...mismatches.map((m) => m.differingPixels as number));
	return {
		cause: "raster",
		pattern,
		message: `Each differing frame changes at most ${most} pixels, no more than ${RASTER_LINES} lines of the frame: that is how Chrome rasterising the same content differently looks (the antialiased edges of moving elements), rather than the composition. Motio resets the raster state before every capture to prevent it, so please report it with the composition; the region of each frame is in mismatches in --json. If a small element of the composition does change between runs, the pattern points to this: ${CAUSE_MESSAGES[pattern]}`,
	};
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
 * An element smaller than a block that moves more than a block per frame (a cursor, the edge of
 * a sliding panel) passes through each block in one frame, so a block is also left alone when
 * its content is found in both neighbours, displaced in opposite directions: it came from one
 * side and went on to the other (see `movesThrough`).
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
			const block = { x: bx, y: by, width: right - bx, height: bottom - by };
			if (movesThrough(previous, current, next, width, height, block, options.threshold)) continue;
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

/** How far a block's content is looked for in the neighbouring frames, in captured pixels. */
export const FLICKER_MOTION_RADIUS = 4 * FLICKER_BLOCK_SIZE;
/** Least luma range (0 to 255) a block needs to be located: a flat block matches anywhere. */
const MIN_STRUCTURE = 32;

/** A rectangle of a frame, in captured pixels. */
export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

const luma = (frame: Uint8Array, i: number) =>
	((frame[i] as number) * 299 + (frame[i + 1] as number) * 587 + (frame[i + 2] as number) * 114) /
	1000;

/**
 * Sum of RGB differences between `block` in `current` and the same block moved by dx, dy in
 * `other`; stops once past `ceiling`.
 */
function blockCost(
	current: Uint8Array,
	other: Uint8Array,
	width: number,
	block: Rect,
	dx: number,
	dy: number,
	ceiling: number,
): number {
	let cost = 0;
	for (let y = 0; y < block.height && cost <= ceiling; y++) {
		let i = ((block.y + y) * width + block.x) * 4;
		let j = ((block.y + dy + y) * width + block.x + dx) * 4;
		for (let x = 0; x < block.width; x++, i += 4, j += 4) {
			cost +=
				Math.abs((current[i] as number) - (other[j] as number)) +
				Math.abs((current[i + 1] as number) - (other[j + 1] as number)) +
				Math.abs((current[i + 2] as number) - (other[j + 2] as number));
		}
	}
	return cost;
}

/**
 * Where the content of `block` in `current` sits in `other`, within `FLICKER_MOTION_RADIUS`: the
 * displacement with the smallest mean RGB difference, if that difference is at most `limit`.
 * Searched every 2 px, then refined around the best candidates.
 */
function locate(
	current: Uint8Array,
	other: Uint8Array,
	width: number,
	height: number,
	block: Rect,
	limit: number,
): { dx: number; dy: number } | null {
	const budget = limit * block.width * block.height * 3 * 255;
	const r = FLICKER_MOTION_RADIUS;
	const inside = (dx: number, dy: number) =>
		block.x + dx >= 0 &&
		block.x + dx + block.width <= width &&
		block.y + dy >= 0 &&
		block.y + dy + block.height <= height;
	// The coarse pass keeps candidates up to twice the budget: half a pixel off can cost that much.
	const coarse: Array<{ dx: number; dy: number; cost: number }> = [];
	for (let dy = -r; dy <= r; dy += 2) {
		for (let dx = -r; dx <= r; dx += 2) {
			if ((dx === 0 && dy === 0) || !inside(dx, dy)) continue;
			const cost = blockCost(current, other, width, block, dx, dy, 2 * budget);
			if (cost <= 2 * budget) coarse.push({ dx, dy, cost });
		}
	}
	coarse.sort((a, b) => a.cost - b.cost);
	let best: { dx: number; dy: number } | null = null;
	let bestCost = budget;
	for (const candidate of coarse.slice(0, 8)) {
		for (let dy = candidate.dy - 1; dy <= candidate.dy + 1; dy++) {
			for (let dx = candidate.dx - 1; dx <= candidate.dx + 1; dx++) {
				if ((dx === 0 && dy === 0) || !inside(dx, dy)) continue;
				const cost = blockCost(current, other, width, block, dx, dy, bestCost);
				if (cost <= bestCost) {
					bestCost = cost;
					best = { dx, dy };
				}
			}
		}
	}
	return best;
}

/**
 * Whether the content of `block` in `current` is an element passing through: it has enough
 * structure to be located, and it is found in both neighbours (within half the block
 * threshold), behind it in the previous frame and ahead in the next (displacements in opposite
 * directions). A one-frame jump, where the element leaves its place and comes back, is found on
 * the same side in both and is not exempted.
 */
export function movesThrough(
	previous: Uint8Array,
	current: Uint8Array,
	next: Uint8Array,
	width: number,
	height: number,
	block: Rect,
	threshold: number,
): boolean {
	let low = 255;
	let high = 0;
	for (let y = block.y; y < block.y + block.height; y++) {
		for (let i = (y * width + block.x) * 4, end = i + block.width * 4; i < end; i += 4) {
			const value = luma(current, i);
			if (value < low) low = value;
			if (value > high) high = value;
		}
	}
	if (high - low < MIN_STRUCTURE) return false;
	const from = locate(current, previous, width, height, block, threshold / 2);
	if (!from) return false;
	const to = locate(current, next, width, height, block, threshold / 2);
	if (!to) return false;
	return from.dx * to.dx + from.dy * to.dy < 0;
}

/** Block threshold for a `--threshold` meant for the whole frame: five times it, at most 0.9. */
export function blockThresholdFor(threshold: number): number {
	return Math.min(0.9, threshold * 5);
}
