import type { ProjectConfig } from "./config.js";
import type { CommandContext } from "./context.js";
import type { ResolvedFfmpeg } from "./renderer-api.js";

/**
 * The executables the config file names (`ffmpeg.executable`, `ffmpeg.ffprobeExecutable`),
 * passed as options only when `MOTIO_FFMPEG` / `MOTIO_FFPROBE` are unset: the variables win over
 * the file, and the renderer reads them itself (so the source stays `env`).
 */
export function configFfmpegOptions(
	ctx: Pick<CommandContext, "io">,
	settings: Pick<ProjectConfig, "motio"> | undefined,
): { ffmpegExecutable?: string; ffprobeExecutable?: string } {
	const ffmpeg = settings?.motio.ffmpeg;
	const executable = ctx.io.env.MOTIO_FFMPEG ? undefined : ffmpeg?.executable;
	const probe = ctx.io.env.MOTIO_FFPROBE ? undefined : ffmpeg?.ffprobeExecutable;
	return {
		...(executable ? { ffmpegExecutable: executable } : {}),
		...(probe ? { ffprobeExecutable: probe } : {}),
	};
}

/**
 * The FFmpeg a command runs (D-065), downloading the pinned build of `@motiojs/ffmpeg` with a
 * progress line when that package is installed and its build is not downloaded yet. `settings`
 * adds the executables of the config file.
 */
export async function commandFfmpeg(
	ctx: CommandContext,
	settings?: Pick<ProjectConfig, "motio">,
): Promise<ResolvedFfmpeg> {
	const resolved = await ctx.resolveFfmpeg({
		...configFfmpegOptions(ctx, settings),
		onDownloadProgress: ({ downloadedBytes, totalBytes }) =>
			ctx.reporter.progress(
				"Downloading FFmpeg",
				totalBytes > 0 ? downloadedBytes / totalBytes : 0,
			),
	});
	// Only `download: false` resolves to null.
	const ffmpeg = resolved as ResolvedFfmpeg;
	// The CLI passes this FFmpeg to the renderer explicitly, so the renderer cannot warn about
	// the fallback itself: the warning is raised here.
	if (ffmpeg.fallback) {
		ctx.reporter.renderWarning({ code: "W_FFMPEG_FALLBACK", message: ffmpeg.fallback.message });
	}
	return ffmpeg;
}

/** How `doctor` and `render` name a source. */
export const FFMPEG_SOURCE_LABELS: Record<ResolvedFfmpeg["source"], string> = {
	option: "ffmpeg.executable in the config file",
	env: "MOTIO_FFMPEG",
	package: "@motiojs/ffmpeg",
	path: "PATH",
};
