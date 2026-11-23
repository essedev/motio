import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Concurrency } from "@motiojs/compat/config";
import type { CommandContext } from "../context.js";
import type { Project } from "../project.js";
import type { VideoConfig } from "../renderer-api.js";

export interface RenderToFilesOptions {
	frames: number[];
	imageFormat: "png" | "jpeg";
	concurrency?: Concurrency | undefined;
	scale?: number | undefined;
	/** Order frames are handed to pages (Motio renderer extension). */
	frameOrder?: (frames: number[]) => number[];
	/** Replace a page after this many frames (Motio renderer extension); 1 renders without history. */
	recycleEveryNFrames?: number;
	label: string;
}

/**
 * Renders frames through `renderFrames` into a temporary directory removed when the command
 * ends, and returns the file of each frame.
 */
export async function renderToFiles(
	ctx: CommandContext,
	project: Project,
	composition: VideoConfig,
	options: RenderToFilesOptions,
): Promise<Map<number, string>> {
	const directory = await mkdtemp(join(tmpdir(), "motio-frames-"));
	ctx.cleanup.push(() => rm(directory, { recursive: true, force: true }));
	const files = new Map<number, string>();
	const renderer = await ctx.renderer();
	const { cancelSignal, cancel } = renderer.makeCancelSignal();
	const stopListening = ctx.onInterrupt(cancel);
	try {
		await renderer.renderFrames({
			...project.session,
			composition,
			outputDir: null,
			frames: options.frames,
			imageFormat: options.imageFormat,
			cancelSignal,
			...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
			...(options.scale !== undefined ? { scale: options.scale } : {}),
			...(options.frameOrder ? { frameOrder: options.frameOrder } : {}),
			...(options.recycleEveryNFrames !== undefined
				? { recycleEveryNFrames: options.recycleEveryNFrames }
				: {}),
			onFrameBuffer: async (buffer, frame) => {
				const file = join(directory, `${frame}.${options.imageFormat}`);
				await writeFile(file, buffer);
				files.set(frame, file);
				ctx.reporter.progress(options.label, files.size / options.frames.length);
			},
		});
	} finally {
		stopListening();
	}
	const missing = options.frames.filter((frame) => !files.has(frame));
	if (missing.length > 0) {
		throw new Error(`The renderer did not deliver frames ${missing.slice(0, 10).join(", ")}.`);
	}
	return files;
}

/** Frames selected by a frame range, ascending, within the composition. */
export function framesInRange(
	range: number | readonly unknown[] | undefined | null,
	durationInFrames: number,
): number[] {
	const last = durationInFrames - 1;
	const items: Array<[number, number]> = [];
	const add = (item: unknown) => {
		if (typeof item === "number") items.push([item, item]);
		else if (Array.isArray(item))
			items.push([item[0] as number, (item[1] as number | null) ?? last]);
	};
	if (range === undefined || range === null) items.push([0, last]);
	else if (typeof range === "number") add(range);
	else if (range.length === 2 && typeof range[0] === "number" && !Array.isArray(range[1]))
		add(range);
	else for (const item of range) add(item);
	const frames = new Set<number>();
	for (const [start, end] of items) {
		for (let frame = start; frame <= Math.min(end, last); frame++) frames.add(frame);
	}
	return [...frames].sort((a, b) => a - b);
}
