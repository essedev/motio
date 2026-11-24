import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	CODECS,
	COLOR_SPACES,
	type Codec,
	type Concurrency,
	type FrameRange,
	PIXEL_FORMATS,
	PRORES_PROFILES,
	VIDEO_IMAGE_FORMATS,
	X264_PRESETS,
} from "@motiojs/compat/config";
import { Flags, parseCommandArgs } from "../args.js";
import type { CommandContext, CommandResult } from "../context.js";
import { usageError } from "../errors.js";
import { commandFfmpeg } from "../ffmpeg.js";
import { CAPTURE_FLAGS, PROJECT_FLAGS } from "../flags.js";
import {
	assertFrameRangeWithin,
	assertInferableOutput,
	CODEC_EXTENSIONS,
	codecFromOutput,
	parseConcurrency,
	parseFrameRange,
	resolvePath,
} from "../options.js";
import {
	compositionJson,
	openProject,
	outDirOf,
	selectComposition,
	splitPositionals,
} from "../project.js";
import { loadDistributed } from "../renderer-api.js";

export const RENDER_FLAGS = {
	...PROJECT_FLAGS,
	...CAPTURE_FLAGS,
	output: { type: "string", description: "Output file (alternative to the positional output)." },
	codec: { type: "string", description: `Codec: ${CODECS.join(", ")}.` },
	"audio-codec": { type: "string", description: "Audio codec: aac, mp3, pcm-16, opus." },
	"audio-bitrate": { type: "string", description: 'Audio bitrate, for example "128k".' },
	"enforce-audio-track": {
		type: "boolean",
		description: "Write a silent audio track when the composition has no audio.",
	},
	"sample-rate": { type: "string", description: "Audio sample rate in Hz (default 48000)." },
	"separate-audio-to": {
		type: "string",
		description: "Write the audio to this file instead of muxing it into the video.",
	},
	crf: { type: "string", description: "Constant rate factor (quality)." },
	"image-format": { type: "string", description: "Frame capture format: jpeg, png, none." },
	frames: { type: "string", description: "Frames to render: 5, 0-9, 100- or 0,30-59,90-." },
	"every-nth-frame": { type: "string", description: "Render every Nth frame." },
	muted: { type: "boolean", description: "Render without audio." },
	"pixel-format": { type: "string", description: `Pixel format: ${PIXEL_FORMATS.join(", ")}.` },
	"color-space": { type: "string", description: `Colour space: ${COLOR_SPACES.join(", ")}.` },
	"x264-preset": { type: "string", description: "x264 preset, from ultrafast to placebo." },
	"prores-profile": {
		type: "string",
		description: `ProRes profile (codec prores): ${PRORES_PROFILES.join(", ")}.`,
	},
	"number-of-gif-loops": {
		type: "string",
		description: "GIF loops: 0 plays once, n repeats n times; unset loops forever.",
	},
	overwrite: {
		type: "boolean",
		description: "Overwrite the output (default true; --overwrite=false).",
	},
	"frames-per-chunk": {
		type: "string",
		description:
			"Motio: render in chunks of this many frames in parallel processes, then assemble (D-039).",
	},
	chunks: {
		type: "string",
		description: "Motio: render in this many chunks in parallel processes, then assemble (D-039).",
	},
	"concurrency-per-chunk": {
		type: "string",
		description: "Motio: pages each chunk renders with (default 1); --concurrency counts chunks.",
	},
	sequence: {
		type: "boolean",
		description: "Output an image sequence (PNG by default) into the output folder.",
	},
	"image-sequence-pattern": {
		type: "string",
		description: 'Image sequence file names: [frame] and [ext] (default "frame-[frame].[ext]").',
	},
} as const;

/** File names of `motio render --sequence`: `frame-0042.png`. */
export const DEFAULT_SEQUENCE_PATTERN = "frame-[frame].[ext]";

/** `motio render [entry|serve-url] <composition-id> [output]` */
export async function renderCommand(
	ctx: CommandContext,
	argv: readonly string[],
): Promise<CommandResult> {
	const commandStarted = Date.now();
	const { positionals, values } = parseCommandArgs(argv, RENDER_FLAGS);
	const flags = new Flags(values);
	const { entry, id, output: positionalOutput } = splitPositionals(positionals, ctx.io.cwd);

	const frameRangeFlag = flags.string("frames");
	const frameRange = frameRangeFlag ? parseFrameRange(frameRangeFlag) : undefined;
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
	const proResProfile = flags.oneOf("prores-profile", PRORES_PROFILES);
	const numberOfGifLoops = flags.integer("number-of-gif-loops", { min: 0 });
	const imageSequencePattern = flags.string("image-sequence-pattern");
	const framesPerChunk = flags.integer("frames-per-chunk", { min: 1 });
	const chunks = flags.integer("chunks", { min: 1 });
	const concurrencyPerChunk = flags.integer("concurrency-per-chunk", { min: 1 });
	if (framesPerChunk !== undefined && chunks !== undefined) {
		throw usageError("Pass either --frames-per-chunk or --chunks, not both.");
	}
	const chunked = framesPerChunk !== undefined || chunks !== undefined;
	if (chunked && concurrency !== undefined && typeof concurrency !== "number") {
		throw usageError("With --chunks or --frames-per-chunk, --concurrency is a number of chunks.");
	}
	const sampleRate = flags.integer("sample-rate", { min: 1 });
	const separateAudioTo = flags.string("separate-audio-to");
	const outputFlag = flags.string("output");
	if (outputFlag && positionalOutput && outputFlag !== positionalOutput) {
		throw usageError("Pass the output either as an argument or with --output, not both.");
	}

	const project = await openProject(ctx, flags, entry);
	const composition = await selectComposition(ctx, project, flags, id);
	const { config } = project;

	if (frameRange !== undefined && frameRangeFlag) {
		assertFrameRangeWithin(frameRange, frameRangeFlag, composition);
	}
	const requestedOutput = outputFlag ?? positionalOutput ?? config.outputLocation;
	// A list of single frames (`--frames=0,30,60`) renders an image sequence, as in Remotion.
	const sequence =
		flags.boolean("sequence") ??
		(isListOfFrames(frameRange) ? true : undefined) ??
		config.imageSequence ??
		false;
	if (sequence) {
		return renderSequence(ctx, project, composition, commandStarted, {
			output: resolvePath(
				ctx.io.cwd,
				requestedOutput ??
					join(outDirOf(ctx, project), composition.defaultOutName ?? composition.id),
			),
			// PNG: a sequence is usually an intermediate for another tool, where JPEG would lose
			// quality at every step. Remotion's CLI writes element-[frame].jpeg; the config keeps both.
			imageFormat: imageFormat ?? config.videoImageFormat ?? "png",
			jpegQuality: jpegQuality ?? config.jpegQuality,
			frameRange: frameRange ?? config.frameRange ?? undefined,
			everyNthFrame: everyNthFrame ?? config.everyNthFrame,
			concurrency: concurrency ?? config.concurrency ?? undefined,
			scale: scale ?? config.scale,
			imageSequencePattern:
				imageSequencePattern ?? config.imageSequencePattern ?? DEFAULT_SEQUENCE_PATTERN,
		});
	}
	if (requestedOutput && !codecFlag && !config.codec) assertInferableOutput(requestedOutput);
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
			join(
				outDirOf(ctx, project),
				`${composition.defaultOutName ?? composition.id}.${CODEC_EXTENSIONS[codec]}`,
			),
	);
	await mkdir(dirname(output), { recursive: true });

	const renderer = await ctx.renderer();
	// Resolved once here, so the render, its chunks and the JSON result name the same FFmpeg.
	const ffmpeg = await commandFfmpeg(ctx, project.settings);
	const ffmpegVersion = renderer.probeFfmpeg
		? await renderer.probeFfmpeg(ffmpeg.ffmpeg).then(
				(info) => info.version,
				() => null,
			)
		: null;
	const { cancelSignal, cancel } = renderer.makeCancelSignal();
	const stopListening = ctx.onInterrupt(cancel);
	const started = Date.now();
	let renderedFrames = 0;
	const common = {
		...project.session,
		ffmpegExecutable: ffmpeg.ffmpeg,
		ffprobeExecutable: ffmpeg.ffprobe,
		composition,
		codec,
		outputLocation: output,
		cancelSignal,
		overwrite: flags.boolean("overwrite") ?? config.overwriteOutput ?? true,
		muted: flags.boolean("muted") ?? config.muted ?? false,
	};
	try {
		if (chunked) {
			const distributed = await (ctx.distributed ?? loadDistributed)();
			const result = await distributed.renderDistributed({
				...common,
				...pick({
					framesPerChunk,
					chunks,
					concurrencyPerChunk,
					concurrency: (concurrency ?? config.concurrency ?? undefined) as number | undefined,
					crf: crf ?? config.crf,
					imageFormat: imageFormat ?? config.videoImageFormat,
					jpegQuality: jpegQuality ?? config.jpegQuality,
					frameRange: frameRange ?? config.frameRange ?? undefined,
					everyNthFrame: everyNthFrame ?? config.everyNthFrame,
					scale: scale ?? config.scale,
					pixelFormat: pixelFormat ?? config.pixelFormat,
					colorSpace: colorSpace ?? config.colorSpace,
					x264Preset: x264Preset ?? config.x264Preset,
					proResProfile: proResProfile ?? (codec === "prores" ? config.proResProfile : undefined),
					proResBitsPerMacroblock: codec === "prores" ? config.proResBitsPerMacroblock : undefined,
					audioCodec: flags.string("audio-codec") ?? config.audioCodec,
					audioBitrate: flags.string("audio-bitrate") ?? config.audioBitrate ?? undefined,
					enforceAudioTrack: flags.boolean("enforce-audio-track") ?? config.enforceAudioTrack,
					preferLossless: config.preferLosslessAudio,
					sampleRate: sampleRate ?? config.sampleRate,
					separateAudioTo: separateAudioTo ? resolvePath(ctx.io.cwd, separateAudioTo) : undefined,
				}),
				onProgress: (progress) => {
					renderedFrames = progress.renderedFrames;
					ctx.reporter.progress(
						"Rendering chunks",
						progress.progress,
						`(${progress.renderedFrames} rendered)`,
					);
				},
			});
			ctx.reporter.renderResult(result);
		} else {
			const result = await renderer.renderMedia({
				...common,
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
					// The config's ProRes and GIF values apply only to their codec; flags pass through,
					// so a mismatch reports the renderer's error.
					proResProfile: proResProfile ?? (codec === "prores" ? config.proResProfile : undefined),
					proResBitsPerMacroblock: codec === "prores" ? config.proResBitsPerMacroblock : undefined,
					numberOfGifLoops:
						numberOfGifLoops ?? (codec === "gif" ? config.numberOfGifLoops : undefined),
					audioCodec: flags.string("audio-codec") ?? config.audioCodec,
					audioBitrate: flags.string("audio-bitrate") ?? config.audioBitrate ?? undefined,
					enforceAudioTrack: flags.boolean("enforce-audio-track") ?? config.enforceAudioTrack,
					preferLossless: config.preferLosslessAudio,
					sampleRate: sampleRate ?? config.sampleRate,
					separateAudioTo: separateAudioTo ? resolvePath(ctx.io.cwd, separateAudioTo) : undefined,
				}),
				onProgress: (progress) => {
					renderedFrames = progress.renderedFrames;
					ctx.reporter.progress(
						"Rendering",
						progress.progress,
						// Encoding starts after the first frames; "0 encoded" until then reads as stuck.
						progress.encodedFrames > 0
							? `(${progress.renderedFrames} rendered, ${progress.encodedFrames} encoded)`
							: `(${progress.renderedFrames} rendered)`,
					);
				},
			});
			ctx.reporter.renderResult(result);
		}
	} finally {
		stopListening();
	}
	const durationMs = Date.now() - started;
	const totalMs = Date.now() - commandStarted;
	return {
		json: {
			composition: compositionJson(composition),
			output,
			codec,
			renderedFrames,
			durationMs,
			totalMs,
			serveUrl: project.serveUrl,
			ffmpeg: {
				path: ffmpeg.ffmpeg,
				version: ffmpegVersion,
				source: ffmpeg.source,
				...(ffmpeg.pinned ? { build: ffmpeg.pinned.build } : {}),
				...(ffmpeg.fallback ? { fallback: ffmpeg.fallback } : {}),
			},
		},
		human: [`Rendered ${composition.id} to ${output} in ${timing(totalMs, durationMs)}`],
	};
}

/**
 * `6.3s (rendering 5.1s)`: the time the command took, with the share spent rendering, so the
 * line matches what the user waited.
 */
export function timing(totalMs: number, renderMs: number): string {
	const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
	return totalMs - renderMs >= 100
		? `${seconds(totalMs)} (rendering ${seconds(renderMs)})`
		: seconds(totalMs);
}

/** Whether `--frames` lists more than one single frame and no range. */
function isListOfFrames(range: FrameRange | undefined): boolean {
	return (
		Array.isArray(range) &&
		range.length > 1 &&
		range.every((r) => Array.isArray(r) && r[0] === r[1])
	);
}

/** `motio render --sequence`: every selected frame as an image in the output folder. */
async function renderSequence(
	ctx: CommandContext,
	project: Awaited<ReturnType<typeof openProject>>,
	composition: Awaited<ReturnType<typeof selectComposition>>,
	commandStarted: number,
	options: {
		output: string;
		imageFormat: "jpeg" | "png" | "none" | undefined;
		jpegQuality: number | undefined;
		frameRange: FrameRange | undefined;
		everyNthFrame: number | undefined;
		concurrency: Concurrency | undefined;
		scale: number | undefined;
		imageSequencePattern: string | undefined;
	},
): Promise<CommandResult> {
	if (options.imageFormat === "none") {
		throw usageError('An image sequence needs --image-format jpeg or png, not "none".');
	}
	await mkdir(options.output, { recursive: true });
	const renderer = await ctx.renderer();
	const { cancelSignal, cancel } = renderer.makeCancelSignal();
	const stopListening = ctx.onInterrupt(cancel);
	const started = Date.now();
	let renderedFrames = 0;
	try {
		const result = await renderer.renderFrames({
			...project.session,
			composition,
			outputDir: options.output,
			cancelSignal,
			...pick({
				imageFormat: options.imageFormat,
				jpegQuality: options.jpegQuality,
				frameRange: options.frameRange,
				everyNthFrame: options.everyNthFrame,
				concurrency: options.concurrency,
				scale: options.scale,
				imageSequencePattern: options.imageSequencePattern,
			}),
			onFrameUpdate: (count) => {
				renderedFrames = count;
				ctx.reporter.progress("Rendering", 0, `(${count} rendered)`);
			},
		});
		renderedFrames = result.frameCount;
		ctx.reporter.renderResult(result);
	} finally {
		stopListening();
	}
	const durationMs = Date.now() - started;
	const totalMs = Date.now() - commandStarted;
	return {
		json: {
			composition: compositionJson(composition),
			output: options.output,
			codec: null,
			sequence: true,
			imageFormat: options.imageFormat,
			renderedFrames,
			durationMs,
			totalMs,
			serveUrl: project.serveUrl,
		},
		human: [
			`Rendered ${renderedFrames} frames of ${composition.id} to ${options.output} in ${timing(totalMs, durationMs)}`,
		],
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
