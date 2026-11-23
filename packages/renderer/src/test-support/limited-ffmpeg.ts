import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Path of a tool on PATH. */
export function which(tool: string): string {
	return execFileSync("sh", ["-c", `command -v ${tool}`])
		.toString()
		.trim();
}

/** Encoders the system FFmpeg lists. */
export function systemEncoders(): Set<string> {
	const text = execFileSync(which("ffmpeg"), ["-hide_banner", "-encoders"]).toString();
	return new Set([...text.matchAll(/^\s*[A-Z.]{6}\s+(\S+)/gm)].map((m) => m[1] as string));
}

/**
 * An `ffmpeg` (with an `ffprobe` next to it) that runs the system tools but leaves `hidden` out of
 * its `-encoders` list, as a build without those encoders would. Encoding still works, so a test
 * can check both the early error and which encoder a render falls back to.
 */
export function ffmpegWithoutEncoders(dir: string, hidden: readonly string[]): string {
	const bin = mkdtempSync(join(dir, "limited-ffmpeg-"));
	const ffmpeg = join(bin, "ffmpeg");
	const filter = hidden.map((e) => `-e ' ${e} '`).join(" ");
	writeFileSync(
		ffmpeg,
		`#!/bin/sh\ncase " $* " in *" -encoders "*) "${which("ffmpeg")}" "$@" | grep -v ${filter}; exit 0;; esac\nexec "${which("ffmpeg")}" "$@"\n`,
	);
	writeFileSync(join(bin, "ffprobe"), `#!/bin/sh\nexec "${which("ffprobe")}" "$@"\n`);
	chmodSync(ffmpeg, 0o755);
	chmodSync(join(bin, "ffprobe"), 0o755);
	return ffmpeg;
}
