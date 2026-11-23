import {
	closeSync,
	existsSync,
	mkdtempSync,
	openSync,
	readFileSync,
	readSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { modelFileName, type WhisperModel } from "./models.js";
import { run } from "./run.js";
import type { TranscriptionJson } from "./types.js";
import { whisperExecutable } from "./version.js";

/** Called during a transcription with the progress between 0 and 1. */
export type TranscribeOnProgress = (progress: number) => void;

/** Extra arguments for whisper.cpp: flags, or flag and value pairs. */
export type AdditionalArgs = Array<string | [string, string]>;

/** Options of {@link transcribe}. */
export interface TranscribeOptions<WithTokenLevelTimestamp extends boolean = boolean> {
	/** A 16-bit, 16 kHz WAVE file. */
	inputPath: string;
	/** The whisper.cpp folder, as installed by `installWhisperCpp()`. */
	whisperPath: string;
	/** The whisper.cpp version installed there; picks the executable. */
	whisperCppVersion: string;
	/** The model, downloaded with `downloadWhisperModel()`. */
	model: WhisperModel;
	/** Folder holding the model. Default `whisperPath`, where `downloadWhisperModel()` puts it. */
	modelFolder?: string | null;
	/** Translate to English (not with a `.en` model). Default `false`. */
	translateToEnglish?: boolean;
	/** Token-level timestamps (`--dtw`, whisper.cpp 1.5.5 or later), returned as `t_dtw`. Default `false`. */
	tokenLevelTimestamps?: WithTokenLevelTimestamp;
	/** Print whisper.cpp's output. Default `true`. */
	printOutput?: boolean;
	/** Most tokens per item without token-level timestamps (`--max-len`). Default 1. */
	tokensPerItem?: number | null;
	/** Spoken language (a name or code, or `"auto"`). Default: whisper.cpp's. */
	language?: string | null;
	/** Split on words rather than tokens (`--split-on-word`). */
	splitOnWord?: boolean | null;
	/** Cancels the transcription. */
	signal?: AbortSignal | null;
	/** Called with the progress between 0 and 1. */
	onProgress?: TranscribeOnProgress | null;
	/** Enable flash attention (`--flash-attn`). */
	flashAttention?: boolean;
	/** Extra arguments passed to whisper.cpp. */
	additionalArgs?: AdditionalArgs;
}

/**
 * The arguments whisper.cpp gets, in the order the published package passes them (recorded in
 * __oracle__/transcribe.json): JSON output with full token data, progress printing, then the
 * options.
 */
export function whisperArgs(options: {
	inputPath: string;
	outputFile: string;
	modelPath: string;
	model: string;
	tokenLevelTimestamps: boolean;
	tokensPerItem: number | null;
	translateToEnglish: boolean;
	language: string | null;
	splitOnWord: boolean;
	flashAttention: boolean;
	additionalArgs: AdditionalArgs;
}): string[] {
	const maxLength = options.tokenLevelTimestamps ? 1 : (options.tokensPerItem ?? 1);
	return [
		"-f",
		options.inputPath,
		"--output-file",
		options.outputFile,
		"--output-json",
		...(maxLength ? ["--max-len", String(maxLength)] : []),
		"-ojf",
		...(options.tokenLevelTimestamps ? ["--dtw", options.model] : []),
		"-m",
		options.modelPath,
		"-pp",
		...(options.translateToEnglish ? ["-tr"] : []),
		...(options.language ? ["-l", options.language.toLowerCase()] : []),
		...(options.splitOnWord ? ["--split-on-word", "true"] : []),
		...(options.flashAttention ? ["--flash-attn", "true"] : []),
		...options.additionalArgs.flat(),
	];
}

/** The sample rate of a RIFF WAVE file, or `null` when the file has no WAVE header. */
function wavSampleRate(path: string): number | null {
	const header = Buffer.alloc(28);
	const fd = openSync(path, "r");
	try {
		if (readSync(fd, header, 0, 28, 0) < 28) return null;
	} finally {
		closeSync(fd);
	}
	if (header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8, 12) !== "WAVE") {
		return null;
	}
	return header.readUInt32LE(24);
}

const PROGRESS = /progress\s*=\s*(\d+)%/g;

/**
 * Transcribes a 16 kHz WAVE file with whisper.cpp and resolves to its JSON output (full token
 * data). With `tokenLevelTimestamps`, every item is one token with a `t_dtw` timestamp: pass the
 * result to `toCaptions()`. whisper.cpp writes its JSON to a temporary folder, removed afterwards.
 */
export async function transcribe<WithTokenLevelTimestamp extends boolean = false>(
	options: TranscribeOptions<WithTokenLevelTimestamp>,
): Promise<TranscriptionJson<WithTokenLevelTimestamp>> {
	const {
		inputPath,
		whisperPath,
		whisperCppVersion,
		model,
		modelFolder,
		translateToEnglish = false,
		tokenLevelTimestamps = false,
		printOutput = true,
		tokensPerItem = 1,
		language = null,
		splitOnWord = false,
		signal,
		onProgress,
		flashAttention = false,
		additionalArgs = [],
	} = options;
	if (!existsSync(inputPath)) {
		throw new Error(`transcribe(): the input file ${inputPath} does not exist.`);
	}
	if (extname(inputPath).toLowerCase() !== ".wav") {
		throw new Error(
			`transcribe(): ${inputPath} is not a .wav file. Convert it to a 16-bit, 16 kHz WAVE file first, for example: ffmpeg -i input.mp4 -ar 16000 output.wav -y`,
		);
	}
	const sampleRate = wavSampleRate(inputPath);
	if (sampleRate !== null && sampleRate !== 16000) {
		throw new Error(
			`transcribe(): ${inputPath} is sampled at ${sampleRate} Hz; whisper.cpp needs 16 kHz. Convert it, for example: ffmpeg -i ${inputPath} -ar 16000 output.wav -y`,
		);
	}
	const modelPath = join(modelFolder ?? whisperPath, modelFileName(model));
	if (!existsSync(modelPath)) {
		throw new Error(
			`transcribe(): the model ${model} is not at ${modelPath}. Download it with downloadWhisperModel(), or pass the modelFolder that holds it.`,
		);
	}
	const executable = whisperExecutable(whisperPath, whisperCppVersion, existsSync);
	const workDir = mkdtempSync(join(tmpdir(), "motio-whisper-"));
	const outputFile = join(workDir, "transcription");
	try {
		const args = whisperArgs({
			inputPath,
			outputFile,
			modelPath,
			model,
			tokenLevelTimestamps: Boolean(tokenLevelTimestamps),
			tokensPerItem,
			translateToEnglish,
			language,
			splitOnWord: Boolean(splitOnWord),
			flashAttention,
			additionalArgs,
		});
		const result = await run(executable, args, {
			cwd: whisperPath,
			print: printOutput,
			...(signal ? { signal } : {}),
			onStderr: (text) => {
				for (const match of text.matchAll(PROGRESS)) onProgress?.(Number(match[1]) / 100);
			},
		});
		const json = `${outputFile}.json`;
		if (!existsSync(json)) {
			throw new Error(
				`transcribe(): whisper.cpp produced no transcription (exit code ${result.code}):\n${result.stderr || result.stdout}`,
			);
		}
		onProgress?.(1);
		return JSON.parse(readFileSync(json, "utf8")) as TranscriptionJson<WithTokenLevelTimestamp>;
	} finally {
		rmSync(workDir, { recursive: true, force: true });
	}
}
