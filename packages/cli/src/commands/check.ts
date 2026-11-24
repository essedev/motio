import { readFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import type { Concurrency } from "@motiojs/compat/config";
import { Flags, parseCommandArgs } from "../args.js";
import type { CommandContext, CommandResult } from "../context.js";
import { EXIT, usageError } from "../errors.js";
import { commandFfmpeg } from "../ffmpeg.js";
import { CAPTURE_FLAGS, PROJECT_FLAGS } from "../flags.js";
import {
	blockFlicker,
	blockThresholdFor,
	compareRuns,
	diagnoseMismatches,
	FLICKER_BLOCK_SIZE,
	type FlickerFrame,
	formatFrameList,
	hashPixels,
	isFlicker,
	meanAbsoluteDifference,
	pngSize,
} from "../frames/compare.js";
import { decodePngs } from "../frames/ffmpeg.js";
import { framesInRange, renderToFiles } from "../frames/render-to-files.js";
import { parseConcurrency, parseFrameRange } from "../options.js";
import { compositionJson, openProject, selectComposition } from "../project.js";

const CHECK_FLAGS = {
	...PROJECT_FLAGS,
	scale: CAPTURE_FLAGS.scale,
	concurrency: CAPTURE_FLAGS.concurrency,
	frames: {
		type: "string",
		description: "Frames to check: 0-59, 100-, ... (default: up to 60 from the start).",
	},
} as const;

export const DETERMINISM_FLAGS = {
	...CHECK_FLAGS,
	reference: {
		type: "string",
		description:
			"Motio: what each run is compared with: runs (the first run, default) or fresh (every frame on a new page, which also catches pixels that depend on the frames a page rendered before).",
	},
} as const;

/** What `check determinism` compares every run with. */
export type DeterminismReference = "runs" | "fresh";

export const FLICKER_FLAGS = {
	...CHECK_FLAGS,
	threshold: {
		type: "string",
		description:
			"Minimum mean difference from both neighbours, 0 to 1 (default 0.02); each 16 px block is held to five times it, so a small element shown for one frame is caught.",
	},
} as const;

/** Default checked range: the whole composition up to 60 frames. */
const DEFAULT_MAX_FRAMES = 60;

function checkPositionals(positionals: readonly string[]): { entry?: string; id?: string } {
	if (positionals.length > 2) throw usageError(`Too many arguments: ${positionals.join(" ")}.`);
	if (positionals.length === 2)
		return { entry: positionals[0] as string, id: positionals[1] as string };
	return positionals[0] ? { id: positionals[0] } : {};
}

async function prepare(
	ctx: CommandContext,
	argv: readonly string[],
	specs: typeof CHECK_FLAGS | typeof DETERMINISM_FLAGS,
) {
	const { positionals, values } = parseCommandArgs(argv, specs);
	const flags = new Flags(values);
	const { entry, id } = checkPositionals(positionals);
	const rangeFlag = flags.string("frames");
	const range = rangeFlag ? parseFrameRange(rangeFlag) : undefined;
	const concurrencyFlag = flags.string("concurrency");
	const scale = flags.number("scale", (n) => n > 0 && n <= 16, "a number above 0 and at most 16");
	const project = await openProject(ctx, flags, entry);
	const composition = await selectComposition(ctx, project, flags, id);
	let frames = framesInRange(range, composition.durationInFrames);
	if (!range) frames = frames.slice(0, DEFAULT_MAX_FRAMES);
	if (frames.length === 0)
		throw usageError(`--frames ${rangeFlag} selects no frame of ${composition.id}.`);
	return {
		flags,
		project,
		composition,
		frames,
		scale,
		concurrency: concurrencyFlag ? parseConcurrency(concurrencyFlag) : undefined,
	};
}

/** One render of `check determinism`. */
export interface DeterminismRun {
	order: "ascending" | "descending";
	concurrency: Concurrency;
	frameOrder: (frames: number[]) => number[];
	/** Every frame on a new page: the reference without any history. */
	freshPage?: true;
}

/**
 * The runs of `check determinism`: two orders at concurrency 1 and at a higher concurrency. With
 * the `fresh` reference a first run renders every frame on a new page, and every other run is
 * compared with it: two runs whose pages carry the same history agree with each other even when
 * both are wrong (a transform change below Blink's raster tolerance, D-072), a new page has none.
 */
export function determinismRuns(
	highConcurrency: Concurrency,
	reference: DeterminismReference = "runs",
): DeterminismRun[] {
	const ascending = (frames: number[]) => [...frames].sort((a, b) => a - b);
	const descending = (frames: number[]) => [...frames].sort((a, b) => b - a);
	const runs: DeterminismRun[] = [
		{ order: "ascending", concurrency: 1 as Concurrency, frameOrder: ascending },
		{ order: "descending", concurrency: 1 as Concurrency, frameOrder: descending },
		{ order: "ascending", concurrency: highConcurrency, frameOrder: ascending },
		{ order: "descending", concurrency: highConcurrency, frameOrder: descending },
	];
	if (reference === "fresh") {
		runs.unshift({
			order: "ascending",
			concurrency: 1 as Concurrency,
			frameOrder: ascending,
			freshPage: true,
		});
	}
	return runs;
}

/**
 * `motio check determinism [entry] <composition-id>`: renders the frames in two orders at two
 * concurrencies and compares the hashes of the decoded pixels.
 */
export async function checkDeterminismCommand(
	ctx: CommandContext,
	argv: readonly string[],
): Promise<CommandResult> {
	const { flags, project, composition, frames, scale, concurrency } = await prepare(
		ctx,
		argv,
		DETERMINISM_FLAGS,
	);
	const reference: DeterminismReference = flags.oneOf("reference", ["runs", "fresh"]) ?? "runs";
	// Never above the CPU threads: the renderer rejects that (1-thread CI containers).
	const high: Concurrency =
		concurrency ??
		Math.min(
			availableParallelism(),
			Math.max(2, Math.min(4, Math.floor(availableParallelism() / 2))),
		);
	const runs = determinismRuns(high, reference);
	const hashes: Array<Map<number, string>> = [];
	for (const [index, run] of runs.entries()) {
		const files = await renderToFiles(ctx, project, composition, {
			frames,
			imageFormat: "png",
			concurrency: run.concurrency,
			scale,
			frameOrder: run.frameOrder,
			...(run.freshPage ? { recycleEveryNFrames: 1 } : {}),
			label: run.freshPage
				? `Run ${index + 1}/${runs.length} (a new page per frame)`
				: `Run ${index + 1}/${runs.length} (${run.order}, concurrency ${run.concurrency})`,
		});
		const runHashes = new Map<number, string>();
		await decodePngs(
			(await commandFfmpeg(ctx)).ffmpeg,
			frames.map((frame) => files.get(frame) as string),
			(i, rgba) => void runHashes.set(frames[i] as number, hashPixels(rgba)),
		);
		hashes.push(runHashes);
	}
	const mismatches = compareRuns(hashes);
	const deterministic = mismatches.length === 0;
	const diagnosis = deterministic ? null : diagnoseMismatches(mismatches, runs);
	return {
		json: {
			composition: compositionJson(composition),
			frames,
			reference,
			runs: runs.map(({ order, concurrency: c, freshPage }) => ({
				order,
				concurrency: c,
				...(freshPage ? { freshPage } : {}),
			})),
			deterministic,
			mismatches,
			...(diagnosis ? { diagnosis } : {}),
		},
		human: deterministic
			? [
					reference === "fresh"
						? `Deterministic: ${frames.length} frames identical to a new page per frame across ${runs.length - 1} runs (2 orders, concurrency 1 and ${high}).`
						: `Deterministic: ${frames.length} frames identical across ${runs.length} runs (2 orders, concurrency 1 and ${high}).`,
				]
			: [
					reference === "fresh"
						? `Not deterministic: ${mismatches.length} of ${frames.length} frames differ from a new page per frame in at least one run.`
						: `Not deterministic: ${mismatches.length} of ${frames.length} frames differ between runs.`,
					`Frames: ${formatFrameList(mismatches.map((m) => m.frame))}`,
					...(diagnosis ? [diagnosis.message] : []),
				],
		exitCode: deterministic ? EXIT.ok : EXIT.checkFailed,
	};
}

/**
 * `motio check flicker [entry] <composition-id>`: flags frames that differ from both
 * neighbours by more than the threshold while the neighbours resemble each other.
 */
export async function checkFlickerCommand(
	ctx: CommandContext,
	argv: readonly string[],
): Promise<CommandResult> {
	const { flags, project, composition, frames, scale, concurrency } = await prepare(
		ctx,
		argv,
		FLICKER_FLAGS,
	);
	const threshold =
		flags.number("threshold", (n) => n > 0 && n < 1, "a number between 0 and 1") ?? 0.02;
	const files = await renderToFiles(ctx, project, composition, {
		frames,
		imageFormat: "png",
		concurrency: concurrency ?? project.config.concurrency ?? undefined,
		scale,
		label: "Rendering",
	});
	const flagged: FlickerFrame[] = [];
	const { width, height } = pngSize(await readFile(files.get(frames[0] as number) as string));
	const blockOptions = { threshold: blockThresholdFor(threshold) };
	// Sliding window of the last three decoded frames; only consecutive frames are compared.
	const window: Array<{ frame: number; rgba: Buffer }> = [];
	await decodePngs(
		(await commandFfmpeg(ctx)).ffmpeg,
		frames.map((frame) => files.get(frame) as string),
		(index, rgba) => {
			window.push({ frame: frames[index] as number, rgba: Buffer.from(rgba) });
			if (window.length > 3) window.shift();
			const [previous, current, next] = window;
			if (!previous || !current || !next) return;
			if (current.frame !== previous.frame + 1 || next.frame !== current.frame + 1) return;
			const diffPrevious = meanAbsoluteDifference(previous.rgba, current.rgba);
			const diffNext = meanAbsoluteDifference(current.rgba, next.rgba);
			const diffNeighbours = meanAbsoluteDifference(previous.rgba, next.rgba);
			const blocks = blockFlicker(
				previous.rgba,
				current.rgba,
				next.rgba,
				width,
				height,
				blockOptions,
			);
			if (isFlicker(diffPrevious, diffNext, diffNeighbours, { threshold }) || blocks) {
				flagged.push({
					frame: current.frame,
					diffPrevious,
					diffNext,
					diffNeighbours,
					...(blocks ? { blocks } : {}),
				});
			}
		},
	);
	const clean = flagged.length === 0;
	return {
		json: {
			composition: compositionJson(composition),
			frames: frames.length,
			threshold,
			clean,
			flagged,
		},
		human: clean
			? [`No flicker in ${frames.length} frames (threshold ${threshold}).`]
			: [
					`Flicker on ${flagged.length} frame(s):`,
					...flagged.map((f) =>
						f.blocks && !isFlicker(f.diffPrevious, f.diffNext, f.diffNeighbours, { threshold })
							? `  frame ${f.frame}: ${f.blocks.blocks} block(s) of ${FLICKER_BLOCK_SIZE} px shown for this frame only, up to ${(f.blocks.maxDiff * 100).toFixed(0)}% different, in ${f.blocks.region.width}x${f.blocks.region.height} at ${f.blocks.region.x},${f.blocks.region.y}`
							: `  frame ${f.frame}: ${(f.diffPrevious * 100).toFixed(1)}% from the previous, ${(f.diffNext * 100).toFixed(1)}% from the next, neighbours ${(f.diffNeighbours * 100).toFixed(1)}% apart`,
					),
				],
		exitCode: clean ? EXIT.ok : EXIT.checkFailed,
	};
}
