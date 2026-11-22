import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { MotioError } from "@motiojs/compat";
import { pngSize } from "./compare.js";

function ffmpegError(ffmpegPath: string, args: string[], detail: string): MotioError {
	return new MotioError("E_FFMPEG_FAILED", `FFmpeg failed: ${detail}`, {
		ffmpeg: ffmpegPath,
		args: args.join(" "),
	});
}

/** Writes `files` in order to a process' stdin, waiting for drain. */
async function pipeFiles(stdin: NodeJS.WritableStream, files: readonly string[]): Promise<void> {
	for (const file of files) {
		const data = await readFile(file);
		if (!stdin.write(data))
			await new Promise<void>((resolve) => stdin.once("drain", () => resolve()));
	}
	stdin.end();
}

/**
 * Decodes PNG files to RGBA with one FFmpeg process, calling `onFrame` in file order with each
 * frame's pixels (the buffer is reused only after the callback returns).
 */
export async function decodePngs(
	ffmpegPath: string,
	files: readonly string[],
	onFrame: (index: number, rgba: Buffer) => void,
): Promise<void> {
	const first = files[0];
	if (!first) return;
	const { width, height } = pngSize(await readFile(first));
	const frameBytes = width * height * 4;
	const args = [
		"-hide_banner",
		"-loglevel",
		"error",
		"-f",
		"image2pipe",
		"-c:v",
		"png",
		"-i",
		"pipe:0",
		"-f",
		"rawvideo",
		"-pix_fmt",
		"rgba",
		"pipe:1",
	];
	await new Promise<void>((resolve, reject) => {
		const child = spawn(ffmpegPath, args, { stdio: ["pipe", "pipe", "pipe"] });
		let pending: Buffer = Buffer.alloc(0);
		let index = 0;
		let stderr = "";
		let failed = false;
		const fail = (error: unknown) => {
			if (failed) return;
			failed = true;
			child.kill();
			reject(error);
		};
		child.on("error", (error) =>
			fail(
				new MotioError(
					"E_FFMPEG_NOT_FOUND",
					`Could not run FFmpeg at "${ffmpegPath}": ${error.message}`,
					{
						ffmpeg: ffmpegPath,
					},
				),
			),
		);
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.stdout.on("data", (chunk: Buffer) => {
			pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
			try {
				while (pending.length >= frameBytes) {
					onFrame(index++, pending.subarray(0, frameBytes));
					pending = pending.subarray(frameBytes);
				}
			} catch (error) {
				fail(error);
			}
		});
		child.on("close", (code) => {
			if (failed) return;
			if (code !== 0)
				return fail(ffmpegError(ffmpegPath, args, stderr.trim() || `exit code ${code}`));
			if (index !== files.length) {
				return fail(ffmpegError(ffmpegPath, args, `decoded ${index} of ${files.length} frames`));
			}
			resolve();
		});
		pipeFiles(child.stdin, files).catch(fail);
	});
}

export interface ContactSheetLayout {
	columns: number;
	rows: number;
	/** Width of each cell in pixels; the height keeps the aspect ratio. */
	cellWidth: number;
	padding: number;
}

/** Tiles images (in order, row by row) into one PNG with FFmpeg's `tile` filter. */
export async function composeContactSheet(
	ffmpegPath: string,
	files: readonly string[],
	layout: ContactSheetLayout,
	output: string,
): Promise<void> {
	const args = [
		"-hide_banner",
		"-loglevel",
		"error",
		"-y",
		"-f",
		"image2pipe",
		"-i",
		"pipe:0",
		"-vf",
		`scale=${layout.cellWidth}:-2:flags=lanczos,tile=${layout.columns}x${layout.rows}:padding=${layout.padding}:margin=${layout.padding}:color=0x202020`,
		"-frames:v",
		"1",
		"-update",
		"1",
		output,
	];
	await new Promise<void>((resolve, reject) => {
		const child = spawn(ffmpegPath, args, { stdio: ["pipe", "ignore", "pipe"] });
		let stderr = "";
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) =>
			reject(
				new MotioError(
					"E_FFMPEG_NOT_FOUND",
					`Could not run FFmpeg at "${ffmpegPath}": ${error.message}`,
					{
						ffmpeg: ffmpegPath,
					},
				),
			),
		);
		child.on("close", (code) =>
			code === 0
				? resolve()
				: reject(ffmpegError(ffmpegPath, args, stderr.trim() || `exit code ${code}`)),
		);
		pipeFiles(child.stdin, files).catch(reject);
	});
}
