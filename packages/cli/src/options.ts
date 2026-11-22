import { existsSync, readFileSync } from "node:fs";
import { extname, isAbsolute, join } from "node:path";
import type { Codec, Concurrency, FrameRange } from "@motiojs/compat/config";
import { usageError } from "./errors.js";

/**
 * Parses `--frames`: `5`, `0-9`, `100-` (to the end) or a comma-separated list of those
 * (`0,30-59,90-`), as in Remotion's CLI.
 */
export function parseFrameRange(value: string): FrameRange {
	const items = value.split(",").map((part) => part.trim());
	const parsed = items.map((item): number | readonly [number, number] | readonly [number, null] => {
		const single = /^\d+$/.exec(item);
		if (single) return Number(item);
		const range = /^(\d+)-(\d*)$/.exec(item);
		if (!range) {
			throw usageError(
				`--frames "${value}" is not valid: use 5, 0-9, 100- or a list such as 0,30-59,90-.`,
				{
					flag: "frames",
					value,
				},
			);
		}
		const start = Number(range[1]);
		if (range[2] === "") return [start, null] as const;
		const end = Number(range[2]);
		if (end < start) {
			throw usageError(`--frames range ${item} ends before it starts.`, { flag: "frames", value });
		}
		return [start, end] as const;
	});
	if (parsed.length === 1) return parsed[0] as FrameRange;
	return parsed;
}

/** `--concurrency`: a positive integer or a percentage of the CPU threads. */
export function parseConcurrency(value: string): Concurrency {
	if (/^\d+$/.test(value) && Number(value) >= 1) return Number(value);
	if (/^\d+(\.\d+)?%$/.test(value) && Number.parseFloat(value) > 0) return value as `${number}%`;
	throw usageError(
		`--concurrency must be a positive integer or a percentage such as 50%; got "${value}".`,
		{
			flag: "concurrency",
			value,
		},
	);
}

/**
 * `--props`: inline JSON, or a path to a JSON file (relative to `cwd`). Must be an object,
 * like Remotion's input props.
 */
export function parseProps(value: string, cwd: string): Record<string, unknown> {
	let text = value;
	const trimmed = value.trim();
	if (!trimmed.startsWith("{")) {
		const path = isAbsolute(value) ? value : join(cwd, value);
		if (!existsSync(path)) {
			throw usageError(
				`--props must be a JSON object or the path to a JSON file; ${path} does not exist.`,
				{
					flag: "props",
					value,
				},
			);
		}
		text = readFileSync(path, "utf8");
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		throw usageError(
			`--props is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
			{
				flag: "props",
			},
		);
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw usageError("--props must be a JSON object.", { flag: "props" });
	}
	return parsed as Record<string, unknown>;
}

/** File extension of each codec's default container. */
export const CODEC_EXTENSIONS: Record<Codec, string> = {
	h264: "mp4",
	h265: "mp4",
	av1: "mp4",
	vp8: "webm",
	vp9: "webm",
	prores: "mov",
	"h264-mkv": "mkv",
	"h264-ts": "ts",
	gif: "gif",
	mp3: "mp3",
	aac: "aac",
	wav: "wav",
};

const EXTENSION_CODECS: Record<string, Codec> = {
	mp4: "h264",
	m4v: "h264",
	webm: "vp8",
	mov: "prores",
	mkv: "h264-mkv",
	ts: "h264-ts",
	gif: "gif",
	mp3: "mp3",
	aac: "aac",
	m4a: "aac",
	wav: "wav",
};

/** Codec implied by an output file name, as Remotion infers it; `undefined` if unknown. */
export function codecFromOutput(output: string | undefined): Codec | undefined {
	if (!output) return undefined;
	return EXTENSION_CODECS[extname(output).slice(1).toLowerCase()];
}

/** Resolves a path against the working directory. */
export function resolvePath(cwd: string, path: string): string {
	return isAbsolute(path) ? path : join(cwd, path);
}
