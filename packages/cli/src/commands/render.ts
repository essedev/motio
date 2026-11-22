import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { MotioError } from "@motiojs/compat";
import {
	CODECS,
	COLOR_SPACES,
	type Codec,
	PIXEL_FORMATS,
	VIDEO_IMAGE_FORMATS,
	X264_PRESETS,
} from "@motiojs/compat/config";
import { Flags, parseCommandArgs } from "../args.js";
import type { CommandContext, CommandResult } from "../context.js";
import { usageError } from "../errors.js";
import { CAPTURE_FLAGS, PROJECT_FLAGS } from "../flags.js";
import {
	CODEC_EXTENSIONS,
	codecFromOutput,
	parseConcurrency,
	parseFrameRange,
	resolvePath,
} from "../options.js";
import { compositionJson, openProject, selectComposition, splitPositionals } from "../project.js";

export const RENDER_FLAGS = {
	...PROJECT_FLAGS,
	...CAPTURE_FLAGS,
	output: { type: "string", description: "Output file (alternative to the positional output)." },
	codec: { type: "string", description: `Codec: ${CODECS.join(", ")}.` },
	"audio-codec": { type: "string", description: "Audio codec." },
	crf: { type: "string", description: "Constant rate factor (quality)." },
	"image-format": { type: "string", description: "Frame capture format: jpeg, png, none." },
	frames: { type: "string", description: "Frames to render: 5, 0-9, 100- or 0,30-59,90-." },
	"every-nth-frame": { type: "string", description: "Render every Nth frame." },
	muted: { type: "boolean", description: "Render without audio." },
	"pixel-format": { type: "string", description: `Pixel format: ${PIXEL_FORMATS.join(", ")}.` },
	"color-space": { type: "string", description: `Colour space: ${COLOR_SPACES.join(", ")}.` },
	"x264-preset": { type: "string", description: "x264 preset, from ultrafast to placebo." },
	overwrite: {
		type: "boolean",
		description: "Overwrite the output (default true; --overwrite=false).",
	},
	sequence: { type: "boolean", description: "Output an image sequence (not supported yet)." },
} as const;

/** `motio render [entry|serve-url] <composition-id> [output]` */
export async function renderCommand(
	ctx: CommandContext,
	argv: readonly string[],
): Promise<CommandResult> {
	const { positionals, values } = parseCommandArgs(argv, RENDER_FLAGS);
	const flags = new Flags(values);
	const { entry, id, output: positionalOutput } = splitPositionals(positionals, ctx.io.cwd);

	const frameRangeFlag = flags.string("frames");
	const frameRange = frameRangeFlag ? parseFrameRange(frameRangeFlag) : undefined;
	if (
		flags.boolean("sequence") ||
		(Array.isArray(frameRange) &&
			frameRange.length > 2 &&
			frameRange.every((f) => typeof f === "number"))
	) {
		throw new MotioError(
			"E_UNSUPPORTED_OPTION",
			"Image sequence output is not supported yet; use `motio frames` for a contact sheet or `motio still` for single frames.",
			{ option: "sequence" },
		);
	}
	const codecFlag = flags.oneOf("codec", CODECS);
	const imageFormat = flags.oneOf("image-format", VIDEO_IMAGE_FORMATS);
	const crf = flags.integer("crf", { min: 0 });
	const jpegQuality = flags.integer("jpeg-quality", { min: 0, max: 100 });
	const everyNthFrame = flags.integer("every-nth-frame", { min: 1 });
	const concurrencyFlag = flags.string("concurrency");
	const concurrency = concurrencyFlag ? parseConcurrency(concurrencyFlag) : undefined;
	const scale = flags.number("scale", (n) => n > 0 && n <= 16, "a number above 0 and at most 16");
	const pixelFormat = flags.oneOf("pixel-format", PIXEL_FORMATS);
	const colorSpace = flags.oneOf("color-space", COLOR_SPACES);
	const x264Preset = flags.oneOf("x264-preset", X264_PRESETS);
	const outputFlag = flags.string("output");
	if (outputFlag && positionalOutput && outputFlag !== positionalOutput) {
		throw usageError("Pass the output either as an argument or with --output, not both.");
	}

	const project = await openProject(ctx, flags, entry);
	const composition = await selectComposition(ctx, project, flags, id);
	const { config } = project;

	const requestedOutput = outputFlag ?? positionalOutput ?? config.outputLocation;
	const codec: Codec =
		codecFlag ??
		config.codec ??
		codecFromOutput(requestedOutput) ??
		((CODECS as readonly string[]).find((c) => c === composition.defaultCodec) as
			| Codec
			| undefined) ??
		"h264";
	const output = resolvePath(
		ctx.io.cwd,
		requestedOutput ??
			join("out", `${composition.defaultOutName ?? composition.id}.${CODEC_EXTENSIONS[codec]}`),
	);
	await mkdir(dirname(output), { recursive: true });

	const renderer = await ctx.renderer();
	const { cancelSignal, cancel } = renderer.makeCancelSignal();
	const stopListening = ctx.onInterrupt(cancel);
	const started = Date.now();
	let renderedFrames = 0;
	try {
		await renderer.renderMedia({
			...project.session,
			composition,
			codec,
			outputLocation: output,
			cancelSignal,
			overwrite: flags.boolean("overwrite") ?? config.overwriteOutput ?? true,
			muted: flags.boolean("muted") ?? config.muted ?? false,
			...pick({
				crf: crf ?? config.crf,
				imageFormat: imageFormat ?? config.videoImageFormat,
				jpegQuality: jpegQuality ?? config.jpegQuality,
				frameRange: frameRange ?? config.frameRange ?? undefined,
				everyNthFrame: everyNthFrame ?? config.everyNthFrame,
				concurrency: concurrency ?? config.concurrency ?? undefined,
				scale: scale ?? config.scale,
				pixelFormat: pixelFormat ?? config.pixelFormat,
				colorSpace: colorSpace ?? config.colorSpace,
				x264Preset: x264Preset ?? config.x264Preset,
				audioCodec: flags.string("audio-codec") ?? config.audioCodec,
			}),
			onProgress: (progress) => {
				renderedFrames = progress.renderedFrames;
				ctx.reporter.progress(
					"Rendering",
					progress.progress,
					`(${progress.renderedFrames} rendered, ${progress.encodedFrames} encoded)`,
				);
			},
		});
	} finally {
		stopListening();
	}
	const durationMs = Date.now() - started;
	return {
		json: {
			composition: compositionJson(composition),
			output,
			codec,
			renderedFrames,
			durationMs,
			serveUrl: project.serveUrl,
		},
		human: [`Rendered ${composition.id} to ${output} in ${(durationMs / 1000).toFixed(1)}s`],
	};
}

/** Drops undefined entries, for `exactOptionalPropertyTypes`. */
export function pick<T extends Record<string, unknown>>(
	values: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
	return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as {
		[K in keyof T]?: Exclude<T[K], undefined>;
	};
}
