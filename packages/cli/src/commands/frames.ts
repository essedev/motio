import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Flags, parseCommandArgs } from "../args.js";
import type { CommandContext, CommandResult } from "../context.js";
import { usageError } from "../errors.js";
import { commandFfmpeg } from "../ffmpeg.js";
import { CAPTURE_FLAGS, PROJECT_FLAGS } from "../flags.js";
import { pngSize } from "../frames/compare.js";
import { composeContactSheet, decodePngs } from "../frames/ffmpeg.js";
import { drawLabels } from "../frames/labels.js";
import { encodeRgbaPng } from "../frames/png.js";
import { framesInRange, renderToFiles } from "../frames/render-to-files.js";
import { parseConcurrency, parseFrameRange, resolvePath } from "../options.js";
import {
	compositionJson,
	openProject,
	outDirOf,
	selectComposition,
	splitPositionals,
} from "../project.js";

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

/** Writes each cell's frame number in its top-left corner, so a sheet can be read alone. */
async function labelContactSheet(
	ffmpeg: string,
	file: string,
	frames: readonly number[],
	grid: { columns: number; cellWidth: number; cellHeight: number; padding: number },
): Promise<void> {
	const { width, height } = pngSize(await readFile(file));
	let sheet: Buffer | undefined;
	await decodePngs(ffmpeg, [file], (_, rgba) => {
		sheet = Buffer.from(rgba);
	});
	if (!sheet) throw new Error(`Could not read back the contact sheet ${file}.`);
	const dot = Math.max(2, Math.round(grid.cellWidth / 120));
	drawLabels(
		sheet,
		width,
		height,
		frames.map((frame, index) => ({
			x: grid.padding + (index % grid.columns) * (grid.cellWidth + grid.padding),
			y: grid.padding + Math.floor(index / grid.columns) * (grid.cellHeight + grid.padding),
			text: String(frame),
		})),
		dot,
	);
	await writeFile(file, encodeRgbaPng(sheet, width, height));
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
		outputFlag ?? positionalOutput ?? join(outDirOf(ctx, project), `${composition.id}-frames.png`),
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
	const ffmpeg = (await commandFfmpeg(ctx, project.settings)).ffmpeg;
	await composeContactSheet(
		ffmpeg,
		frames.map((frame) => files.get(frame) as string),
		{ columns, rows, cellWidth, padding },
		output,
	);
	const cellHeight = 2 * Math.round((cellWidth * composition.height) / composition.width / 2);
	await labelContactSheet(ffmpeg, output, frames, { columns, cellWidth, cellHeight, padding });
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
