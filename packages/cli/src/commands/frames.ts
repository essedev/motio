import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Flags, parseCommandArgs } from "../args.js";
import type { CommandContext, CommandResult } from "../context.js";
import { usageError } from "../errors.js";
import { commandFfmpeg } from "../ffmpeg.js";
import { CAPTURE_FLAGS, PROJECT_FLAGS } from "../flags.js";
import { composeContactSheet } from "../frames/ffmpeg.js";
import { framesInRange, renderToFiles } from "../frames/render-to-files.js";
import { parseConcurrency, parseFrameRange, resolvePath } from "../options.js";
import { compositionJson, openProject, selectComposition, splitPositionals } from "../project.js";

export const FRAMES_FLAGS = {
	...PROJECT_FLAGS,
	...CAPTURE_FLAGS,
	output: { type: "string", description: "Output PNG (default out/<id>-frames.png)." },
	count: { type: "string", description: "Number of frames in the sheet (default 12)." },
	columns: { type: "string", description: "Columns of the grid (default: a near-square grid)." },
	"cell-width": { type: "string", description: "Width of each cell in pixels (default 320)." },
	frames: { type: "string", description: "Range to sample from: 0-99, 100-, ... (default all)." },
	"image-format": { type: "string", description: "Capture format: jpeg (default) or png." },
} as const;

/** Evenly spaced frames: the first and the last of the range are always included. */
export function sampleFrames(available: readonly number[], count: number): number[] {
	if (available.length <= count) return [...available];
	if (count === 1) return [available[0] as number];
	const picked = new Set<number>();
	for (let i = 0; i < count; i++) {
		picked.add(available[Math.round((i * (available.length - 1)) / (count - 1))] as number);
	}
	return [...picked];
}

/** `motio frames [entry|serve-url] <composition-id> [output]`: a contact sheet. */
export async function framesCommand(
	ctx: CommandContext,
	argv: readonly string[],
): Promise<CommandResult> {
	const { positionals, values } = parseCommandArgs(argv, FRAMES_FLAGS);
	const flags = new Flags(values);
	const { entry, id, output: positionalOutput } = splitPositionals(positionals, ctx.io.cwd);
	const count = flags.integer("count", { min: 1, max: 400 }) ?? 12;
	const columnsFlag = flags.integer("columns", { min: 1, max: 100 });
	const cellWidth = flags.integer("cell-width", { min: 16, max: 4096 }) ?? 320;
	const rangeFlag = flags.string("frames");
	const imageFormat = flags.oneOf("image-format", ["jpeg", "png"] as const) ?? "jpeg";
	const concurrencyFlag = flags.string("concurrency");
	const scale = flags.number("scale", (n) => n > 0 && n <= 16, "a number above 0 and at most 16");
	const outputFlag = flags.string("output");
	if (outputFlag && positionalOutput && outputFlag !== positionalOutput) {
		throw usageError("Pass the output either as an argument or with --output, not both.");
	}

	const project = await openProject(ctx, flags, entry);
	const composition = await selectComposition(ctx, project, flags, id);
	const available = framesInRange(
		rangeFlag ? parseFrameRange(rangeFlag) : undefined,
		composition.durationInFrames,
	);
	if (available.length === 0)
		throw usageError(`--frames ${rangeFlag} selects no frame of ${composition.id}.`);
	const frames = sampleFrames(available, count);
	const columns = Math.min(columnsFlag ?? Math.ceil(Math.sqrt(frames.length)), frames.length);
	const rows = Math.ceil(frames.length / columns);
	const output = resolvePath(
		ctx.io.cwd,
		outputFlag ?? positionalOutput ?? join("out", `${composition.id}-frames.png`),
	);
	await mkdir(dirname(output), { recursive: true });

	const files = await renderToFiles(ctx, project, composition, {
		frames,
		imageFormat,
		concurrency: concurrencyFlag
			? parseConcurrency(concurrencyFlag)
			: (project.config.concurrency ?? undefined),
		scale,
		label: "Rendering frames",
	});
	const padding = 4;
	await composeContactSheet(
		(await commandFfmpeg(ctx)).ffmpeg,
		frames.map((frame) => files.get(frame) as string),
		{ columns, rows, cellWidth, padding },
		output,
	);
	const cellHeight = 2 * Math.round((cellWidth * composition.height) / composition.width / 2);
	return {
		json: {
			composition: compositionJson(composition),
			output,
			frames,
			grid: { columns, rows, cellWidth, cellHeight, padding },
			cells: frames.map((frame, index) => ({
				frame,
				row: Math.floor(index / columns),
				column: index % columns,
			})),
		},
		human: [
			`Contact sheet of ${composition.id} (${frames.length} frames, ${columns}x${rows}) written to ${output}`,
			`Frames: ${frames.join(", ")}`,
		],
	};
}
