import { mkdir } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { STILL_IMAGE_FORMATS, type StillImageFormat } from "@motiojs/compat/config";
import { Flags, parseCommandArgs } from "../args.js";
import type { CommandContext, CommandResult } from "../context.js";
import { usageError } from "../errors.js";
import { CAPTURE_FLAGS, PROJECT_FLAGS } from "../flags.js";
import { resolvePath } from "../options.js";
import {
	compositionJson,
	openProject,
	outDirOf,
	selectComposition,
	splitPositionals,
} from "../project.js";
import { pick, timing } from "./render.js";

export const STILL_FLAGS = {
	...PROJECT_FLAGS,
	scale: CAPTURE_FLAGS.scale,
	"jpeg-quality": CAPTURE_FLAGS["jpeg-quality"],
	output: { type: "string", description: "Output file (alternative to the positional output)." },
	frame: {
		type: "string",
		description: "Frame to render; negative counts from the end (-1 is the last).",
	},
	"image-format": { type: "string", description: "png, jpeg, pdf or webp (default png)." },
	overwrite: {
		type: "boolean",
		description: "Overwrite the output (default true; --overwrite=false).",
	},
} as const;

/** `motio still [entry|serve-url] <composition-id> [output]` */
export async function stillCommand(
	ctx: CommandContext,
	argv: readonly string[],
): Promise<CommandResult> {
	const commandStarted = Date.now();
	const { positionals, values } = parseCommandArgs(argv, STILL_FLAGS);
	const flags = new Flags(values);
	const { entry, id, output: positionalOutput } = splitPositionals(positionals, ctx.io.cwd);
	const frameFlag = flags.integer("frame");
	const imageFormatFlag = flags.oneOf("image-format", STILL_IMAGE_FORMATS);
	const scale = flags.number("scale", (n) => n > 0 && n <= 16, "a number above 0 and at most 16");
	const jpegQuality = flags.integer("jpeg-quality", { min: 0, max: 100 });
	const outputFlag = flags.string("output");
	if (outputFlag && positionalOutput && outputFlag !== positionalOutput) {
		throw usageError("Pass the output either as an argument or with --output, not both.");
	}

	const project = await openProject(ctx, flags, entry, "still");
	const composition = await selectComposition(ctx, project, flags, id);
	const requested = frameFlag ?? 0;
	const frame = requested < 0 ? composition.durationInFrames + requested : requested;
	if (frame < 0 || frame >= composition.durationInFrames) {
		throw usageError(
			`--frame ${requested} is outside ${composition.id} (frames 0 to ${composition.durationInFrames - 1}).`,
			{ frame: requested, durationInFrames: composition.durationInFrames },
		);
	}
	const requestedOutput = outputFlag ?? positionalOutput;
	const fromExtension = requestedOutput
		? (STILL_IMAGE_FORMATS as readonly string[]).find(
				(f) => f === extname(requestedOutput).slice(1).toLowerCase().replace("jpg", "jpeg"),
			)
		: undefined;
	const imageFormat: StillImageFormat =
		imageFormatFlag ??
		project.config.stillImageFormat ??
		(fromExtension as StillImageFormat | undefined) ??
		"png";
	const output = resolvePath(
		ctx.io.cwd,
		requestedOutput ??
			join(
				outDirOf(ctx, project),
				`${composition.id}.${imageFormat === "jpeg" ? "jpeg" : imageFormat}`,
			),
	);
	await mkdir(dirname(output), { recursive: true });

	const renderer = await ctx.renderer();
	const { cancelSignal, cancel } = renderer.makeCancelSignal();
	const stopListening = ctx.onInterrupt(cancel);
	const started = Date.now();
	try {
		ctx.reporter.info(`Rendering frame ${frame} of ${composition.id}`);
		const result = await renderer.renderStill({
			...project.session,
			composition,
			output,
			frame,
			imageFormat,
			cancelSignal,
			overwrite: flags.boolean("overwrite") ?? project.config.overwriteOutput ?? true,
			...pick({
				scale: scale ?? project.config.scale,
				jpegQuality: jpegQuality ?? project.config.jpegQuality,
			}),
		});
		ctx.reporter.renderResult(result);
	} finally {
		stopListening();
	}
	const durationMs = Date.now() - started;
	const totalMs = Date.now() - commandStarted;
	return {
		json: {
			composition: compositionJson(composition),
			output,
			frame,
			imageFormat,
			durationMs,
			totalMs,
		},
		human: [
			`Rendered frame ${frame} of ${composition.id} to ${output} in ${timing(totalMs, durationMs)}`,
		],
	};
}
