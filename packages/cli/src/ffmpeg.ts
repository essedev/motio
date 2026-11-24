import type { CommandContext } from "./context.js";
import type { ResolvedFfmpeg } from "./renderer-api.js";

/**
 * The FFmpeg a command runs (D-065), downloading the pinned build of `@motiojs/ffmpeg` with a
 * progress line when that package is installed and its build is not downloaded yet.
 */
export async function commandFfmpeg(ctx: CommandContext): Promise<ResolvedFfmpeg> {
	const resolved = await ctx.resolveFfmpeg({
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
	option: "explicit option",
	env: "MOTIO_FFMPEG",
	package: "@motiojs/ffmpeg",
	path: "PATH",
};
