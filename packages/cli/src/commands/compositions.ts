import { Flags, parseCommandArgs } from "../args.js";
import type { CommandContext, CommandResult } from "../context.js";
import { usageError } from "../errors.js";
import { PROJECT_FLAGS } from "../flags.js";
import { openProject } from "../project.js";

export const COMPOSITIONS_FLAGS = {
	...PROJECT_FLAGS,
	quiet: { type: "boolean", short: "q", description: "Print only the ids, separated by spaces." },
} as const;

/** `motio compositions [entry|serve-url]` */
export async function compositionsCommand(
	ctx: CommandContext,
	argv: readonly string[],
): Promise<CommandResult> {
	const { positionals, values } = parseCommandArgs(argv, COMPOSITIONS_FLAGS);
	const flags = new Flags(values);
	if (positionals.length > 1) throw usageError(`Too many arguments: ${positionals.join(" ")}.`);
	const project = await openProject(ctx, flags, positionals[0]);
	const renderer = await ctx.renderer();
	const compositions = await renderer.getCompositions(project.session);
	const list = compositions.map((c) => ({
		id: c.id,
		width: c.width,
		height: c.height,
		fps: c.fps,
		durationInFrames: c.durationInFrames,
		defaultProps: c.defaultProps,
	}));
	const human = flags.boolean("quiet")
		? [list.map((c) => c.id).join(" ")]
		: list.length === 0
			? ["No compositions registered."]
			: compositionTable(list);
	return { json: { compositions: list }, human };
}

/** One aligned row per composition: id, size, frame rate, duration. */
export function compositionTable(
	list: ReadonlyArray<{
		id: string;
		width: number;
		height: number;
		fps: number;
		durationInFrames: number;
	}>,
): string[] {
	const rows = list.map((c) => [
		c.id,
		`${c.width}x${c.height}`,
		`${c.fps} fps`,
		`${c.durationInFrames} frames`,
		`(${(c.durationInFrames / c.fps).toFixed(2)}s)`,
	]);
	// Text columns align left, numbers right, so digits line up.
	const right = [false, true, true, true, true];
	const widths =
		rows[0]?.map((_, column) => Math.max(...rows.map((row) => (row[column] as string).length))) ??
		[];
	return rows.map((row) =>
		row
			.map((cell, column) => {
				const width = widths[column] as number;
				return right[column] ? cell.padStart(width) : cell.padEnd(width);
			})
			.join("  ")
			.trimEnd(),
	);
}
