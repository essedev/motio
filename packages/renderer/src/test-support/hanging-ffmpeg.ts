import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * An `ffmpeg` (with an `ffprobe` next to it) that runs the real tools, except that a run whose
 * arguments contain `pattern` hangs: tests cancel a render during that step and check it stops.
 * Returns the path of the `ffmpeg` wrapper and a promise that resolves once the hanging run started.
 */
export function hangingFfmpeg(
	dir: string,
	pattern: string,
): { ffmpeg: string; hanging: Promise<void> } {
	const which = (tool: string) =>
		execFileSync("sh", ["-c", `command -v ${tool}`])
			.toString()
			.trim();
	const bin = mkdtempSync(join(dir, "hanging-ffmpeg-"));
	const ffmpeg = join(bin, "ffmpeg");
	const ffprobe = join(bin, "ffprobe");
	const marker = join(bin, "hanging");
	writeFileSync(
		ffmpeg,
		`#!/bin/sh\ncase "$*" in *"${pattern}"*) touch "${marker}"; exec sleep 60;; esac\nexec "${which("ffmpeg")}" "$@"\n`,
	);
	writeFileSync(ffprobe, `#!/bin/sh\nexec "${which("ffprobe")}" "$@"\n`);
	chmodSync(ffmpeg, 0o755);
	chmodSync(ffprobe, 0o755);
	const hanging = new Promise<void>((resolve) => {
		const poll = setInterval(() => {
			if (existsSync(marker)) {
				clearInterval(poll);
				resolve();
			}
		}, 20);
		poll.unref();
	});
	return { ffmpeg, hanging };
}
