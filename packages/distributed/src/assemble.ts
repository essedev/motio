import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AudioCodec, audioCodecArgs } from "@motiojs/audio";
import { DistributedError } from "./errors.js";
import { run } from "./run.js";

export interface AssembleOptions {
	/** Chunk files in timeline order: video-only MPEG-TS, each starting with a keyframe. */
	chunks: readonly string[];
	/** Output file; the container follows the extension (`.mp4`, `.mov`, `.mkv`). */
	output: string;
	/**
	 * Audio rendered once for the whole timeline (D-014): muxed without re-encoding, or encoded
	 * in the same run with `audioCodec` (from `renderAudio()`'s lossless float WAV).
	 */
	audio?: string;
	/** Encode `audio` with this codec instead of copying it. */
	audioCodec?: AudioCodec;
	/** Bitrate of the encoded audio, FFmpeg `-b:a` syntax. */
	audioBitrate?: string;
	/** Video codec tag of the output, such as `hvc1` for H.265 in MP4. */
	videoTag?: string;
	ffmpeg?: string;
}

/**
 * Concatenates independently encoded chunks without re-encoding and muxes the audio rendered
 * once for the whole timeline. Chunks are MPEG-TS so that B-frame reordering and timestamps
 * survive concatenation: MP4 chunks carry edit lists that the concat demuxer does not apply.
 */
export async function assembleChunks(options: AssembleOptions): Promise<void> {
	const ffmpeg = options.ffmpeg ?? "ffmpeg";
	if (options.chunks.length === 0)
		throw new DistributedError("E_CHUNK_ASSEMBLE", "no chunks to assemble");
	const dir = await mkdtemp(join(tmpdir(), "motio-assemble-"));
	try {
		const list = join(dir, "chunks.txt");
		await writeFile(
			list,
			options.chunks.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join("\n"),
		);
		const args = [
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-f",
			"concat",
			"-safe",
			"0",
			"-i",
			list,
		];
		if (options.audio) args.push("-i", options.audio, "-map", "0:v:0", "-map", "1:a:0");
		args.push("-c:v", "copy");
		if (options.audio) {
			args.push(
				...(options.audioCodec
					? audioCodecArgs(options.audioCodec, options.audioBitrate)
					: ["-c:a", "copy"]),
			);
		}
		if (options.videoTag) args.push("-tag:v", options.videoTag);
		if (/\.(mp4|mov|m4v)$/i.test(options.output)) args.push("-movflags", "+faststart");
		args.push(options.output);
		await run(ffmpeg, args).catch((e: Error) => {
			throw new DistributedError(
				"E_CHUNK_ASSEMBLE",
				`could not assemble ${options.chunks.length} chunks into ${options.output}: ${e.message}`,
				{ output: options.output },
			);
		});
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
