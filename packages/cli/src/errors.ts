import { isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isCodedError, MotioError } from "@motiojs/compat";

/** Process exit codes of the `motio` binary. */
export const EXIT = {
	ok: 0,
	/** A command failed (render error, missing composition...). */
	error: 1,
	/** Invalid arguments or flags. */
	usage: 2,
	/** A check ran and found problems (determinism, flicker, doctor). */
	checkFailed: 3,
} as const;

/** Error for invalid command-line input; exits with code 2. */
export function usageError(message: string, context: Record<string, unknown> = {}): MotioError {
	return new MotioError("E_INVALID_ARGUMENT", message, context);
}

/** The `error` member of a failed JSON result. */
export interface ErrorJson {
	code: string;
	message: string;
	context: Record<string, unknown>;
}

const RENDERER_CONTEXT_KEYS = ["frame", "label", "composition", "pageStack", "details"] as const;

/**
 * Normalises any thrown value to `{ code, message, context }`. Understands the compat
 * `MotioError` (`context`) and the renderer's (`frame`, `label`, `composition`, `details`).
 */
export function toErrorJson(error: unknown): ErrorJson {
	if (isCodedError(error)) {
		const context: Record<string, unknown> = { ...(error.context ?? {}) };
		const record = error as unknown as Record<string, unknown>;
		for (const key of RENDERER_CONTEXT_KEYS) {
			if (record[key] !== undefined) context[key] = record[key];
		}
		return { code: error.code, message: error.message, context };
	}
	if (error instanceof Error) {
		return {
			code: "E_INTERNAL",
			message: error.message,
			context: error.stack ? { stack: error.stack } : {},
		};
	}
	return { code: "E_INTERNAL", message: String(error), context: {} };
}

/**
 * Codes that mean the input was wrong (a flag, a value, a config key, a composition id) rather than the
 * render failing: they exit with 2, whether the CLI or the renderer raised them.
 */
const USAGE_CODES = new Set([
	"E_INVALID_ARGUMENT",
	"E_INVALID_OPTION",
	"E_INVALID_CONFIG",
	"E_UNSUPPORTED_OPTION",
	"E_UNSUPPORTED_CODEC",
	"E_COMPOSITION_REQUIRED",
	"E_COMPOSITION_NOT_FOUND",
]);

/** Exit code for an error: 2 for invalid input, 1 otherwise. */
export function exitCodeFor(error: unknown): number {
	return isCodedError(error) && USAGE_CODES.has(error.code) ? EXIT.usage : EXIT.error;
}

/** The CLI flag of each renderer option, so human messages name what the user can type. */
const OPTION_FLAGS: Readonly<Record<string, string>> = {
	frameRange: "--frames",
	frame: "--frame",
	codec: "--codec",
	outputLocation: "the output path",
	output: "the output path",
	scale: "--scale",
	timeoutInMilliseconds: "--timeout",
	crf: "--crf",
	jpegQuality: "--jpeg-quality",
	everyNthFrame: "--every-nth-frame",
	concurrency: "--concurrency",
	pixelFormat: "--pixel-format",
	colorSpace: "--color-space",
	x264Preset: "--x264-preset",
	proResProfile: "--prores-profile",
	numberOfGifLoops: "--number-of-gif-loops",
	audioCodec: "--audio-codec",
	audioBitrate: "--audio-bitrate",
	imageFormat: "--image-format",
	sampleRate: "--sample-rate",
	separateAudioTo: "--separate-audio-to",
	enforceAudioTrack: "--enforce-audio-track",
	inputProps: "--props",
	browserExecutable: "--browser-executable",
	imageSequencePattern: "--image-sequence-pattern",
	envFile: "--env-file",
	publicDir: "--public-dir",
};

const record = (value: unknown): Record<string, unknown> =>
	typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

/**
 * The lines printed on stderr for a failed command in human mode: the message with renderer
 * option names replaced by their flags, where it happened (frame, composition, source file),
 * and hints (`projectHints` apply to missing files). Every field is read defensively: renderers that do not set them print the
 * message alone.
 */
export function formatErrorLines(
	error: ErrorJson,
	cwd: string,
	projectHints: readonly string[] = [],
): string[] {
	const context = error.context;
	const details = record(context.details);
	const option = typeof details.option === "string" ? details.option : undefined;
	const flag = option ? OPTION_FLAGS[option] : undefined;
	// A message that already names the flag ("timeoutInMilliseconds in the Node API, --timeout on
	// the command line") is kept as written.
	const message =
		option && flag && !error.message.includes(flag)
			? error.message.replace(new RegExp(`\\b${option}\\b`, "g"), flag)
			: error.message;
	const lines = [`error [${error.code}]: ${message}`];

	const frame = details.frame ?? context.frame;
	const composition = details.compositionId ?? context.composition;
	const source = record(details.source);
	const where: string[] = [];
	if (typeof frame === "number") where.push(`at frame ${frame}`);
	if (typeof composition === "string" && composition) {
		where.push(`${where.length > 0 ? "of" : "in"} ${composition}`);
	}
	let at = where.join(" ");
	if (typeof source.file === "string" && source.file) {
		const file = displayPath(source.file, cwd);
		const position =
			typeof source.line === "number"
				? `:${source.line}${typeof source.column === "number" ? `:${source.column}` : ""}`
				: "";
		at = at ? `${at}, ${file}${position}` : `at ${file}${position}`;
	}
	if (at) lines.push(`  ${at}`);

	const hints: string[] = [];
	if (typeof details.hint === "string" && details.hint) hints.push(details.hint);
	// The renderer's message may already name the flag; the hint is for those that do not.
	if (error.code === "E_READINESS_TIMEOUT" && !message.includes("--timeout")) {
		const timeout = details.timeoutMs ?? context.timeoutMs;
		hints.push(
			`Raise the limit with --timeout=<ms>${typeof timeout === "number" ? ` (now ${timeout} ms)` : ""}, or call continueRender() once the work is done.`,
		);
	}
	// A missing file is often a project opened from the wrong folder.
	if (error.code === "E_ASSET_NOT_FOUND" || error.code === "E_FONT_LOAD")
		hints.push(...projectHints);
	for (const hint of hints) lines.push(`  hint: ${hint}`);
	return lines;
}

/** A path relative to `cwd` when it is inside it, else as given. */
function displayPath(file: string, cwd: string): string {
	const path = file.startsWith("file://") ? fileURLToPath(file) : file;
	if (!isAbsolute(path)) return path;
	const rel = relative(cwd, path);
	return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : path;
}
