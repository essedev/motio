import { createWriteStream, existsSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { assertWhisperModel, modelFileName, modelUrl, type WhisperModel } from "./models.js";

/** Called while a model downloads, with the bytes so far and the total. */
export type OnProgress = (downloadedBytes: number, totalBytes: number) => void;

/** Options of {@link downloadWhisperModel}. */
export interface DownloadWhisperModelOptions {
	/** The model to download. */
	model: WhisperModel;
	/** Folder to download into, as `ggml-<model>.bin`; it must exist. */
	folder: string;
	/** Print the progress. Default `true`. */
	printOutput?: boolean;
	/** Called as bytes arrive. */
	onProgress?: OnProgress;
	/** Cancels the download. */
	signal?: AbortSignal | null;
}

/** Result of {@link downloadWhisperModel}. */
export interface DownloadWhisperModelResult {
	/** Whether the file was already there, in which case nothing was downloaded. */
	alreadyExisted: boolean;
}

/**
 * Downloads a Whisper model for whisper.cpp into `folder` as `ggml-<model>.bin`, the file
 * `transcribe()` looks for. Does nothing and resolves to `{ alreadyExisted: true }` when the file
 * is there. The download goes to a temporary name first, so an interrupted one is not mistaken for
 * a model.
 */
export async function downloadWhisperModel(
	options: DownloadWhisperModelOptions,
): Promise<DownloadWhisperModelResult> {
	const { model, folder, printOutput = true, onProgress, signal } = options;
	assertWhisperModel(model);
	const target = join(folder, modelFileName(model));
	if (existsSync(target)) return { alreadyExisted: true };
	if (!existsSync(folder) || !statSync(folder).isDirectory()) {
		throw new Error(
			`downloadWhisperModel(): the folder ${folder} does not exist. Create it first.`,
		);
	}
	const url = modelUrl(model);
	const response = await fetch(url, signal ? { signal } : {});
	if (!response.ok || !response.body) {
		throw new Error(`downloadWhisperModel(): ${url} answered ${response.status}.`);
	}
	const total = Number(response.headers.get("content-length") ?? 0);
	let downloaded = 0;
	let printed = -1;
	const partial = `${target}.download`;
	const body = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
	body.on("data", (chunk: Buffer) => {
		downloaded += chunk.length;
		onProgress?.(downloaded, total);
		const percent = total > 0 ? Math.floor((downloaded / total) * 100) : -1;
		if (printOutput && percent !== printed && (percent % 10 === 0 || downloaded === total)) {
			printed = percent;
			console.log(`${modelFileName(model)}: ${downloaded} of ${total} bytes (${percent}%)`);
		}
	});
	try {
		await pipeline(body, createWriteStream(partial), signal ? { signal } : {});
	} catch (error) {
		rmSync(partial, { force: true });
		throw error;
	}
	renameSync(partial, target);
	return { alreadyExisted: false };
}
