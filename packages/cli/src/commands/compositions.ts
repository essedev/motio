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
			: list.map(
					(c) =>
						`${c.id.padEnd(Math.max(...list.map((x) => x.id.length)) + 2)}${c.width}x${c.height}  ${c.fps} fps  ${c.durationInFrames} frames (${(c.durationInFrames / c.fps).toFixed(2)}s)`,
				);
	return { json: { compositions: list }, human };
}
