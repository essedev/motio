import { MotioError } from "@motiojs/compat";
import { parseCommandArgs } from "../args.js";
import type { CommandContext, CommandResult } from "../context.js";
import { usageError } from "../errors.js";
import { BASE_FLAGS } from "../flags.js";

export const FFMPEG_ENSURE_FLAGS = { ...BASE_FLAGS } as const;

/** `motio ffmpeg ensure`: downloads and verifies the pinned FFmpeg of `@motiojs/ffmpeg` (D-065). */
export async function ffmpegEnsureCommand(
	ctx: CommandContext,
	argv: readonly string[],
): Promise<CommandResult> {
	const { positionals } = parseCommandArgs(argv, FFMPEG_ENSURE_FLAGS);
	if (positionals.length > 0) throw usageError(`Unexpected arguments: ${positionals.join(" ")}.`);
	const renderer = await ctx.renderer();
	const pkg = await renderer.loadFfmpegPackage?.();
	if (!pkg) {
		throw new MotioError(
			"E_FFMPEG_PACKAGE_MISSING",
			"`motio ffmpeg ensure` installs the pinned FFmpeg of @motiojs/ffmpeg, which this project does not have. Add it (pnpm add -D @motiojs/ffmpeg) or keep using the FFmpeg on PATH.",
			{},
		);
	}
	const result = await pkg.ensureFfmpeg({
		onProgress: ({ downloadedBytes, totalBytes }) =>
			ctx.reporter.progress(
				"Downloading FFmpeg",
				totalBytes > 0 ? downloadedBytes / totalBytes : 0,
			),
	});
	return {
		json: {
			ffmpeg: result.ffmpeg,
			ffprobe: result.ffprobe,
			version: result.version,
			build: result.build,
			platform: result.platform,
			directory: result.directory,
			downloaded: result.downloaded,
		},
		human: [
			`${result.downloaded ? "Downloaded" : "Found"} FFmpeg ${result.version} (build ${result.build}, ${result.platform}) at ${result.ffmpeg}`,
			`Licences and sources: ${result.directory}/LICENSE.md`,
		],
	};
}
