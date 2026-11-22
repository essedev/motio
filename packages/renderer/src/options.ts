import { availableParallelism } from "node:os";
import { MotioError } from "./errors.js";

/** Image format of captured video frames. */
export type VideoImageFormat = "jpeg" | "png" | "none";
/** Image format of a still. */
export type StillImageFormat = "png" | "jpeg" | "webp" | "pdf";

/** `frameRange`: one frame, an inclusive range, an open range, or ordered ranges. */
export type FrameRange =
	| number
	| readonly [number, number]
	| readonly [number, null]
	| readonly (readonly [number, number] | readonly [number, null])[];

export const X264_PRESETS = [
	"ultrafast",
	"superfast",
	"veryfast",
	"faster",
	"fast",
	"medium",
	"slow",
	"slower",
	"veryslow",
	"placebo",
] as const;
/** libx264 speed preset. */
export type X264Preset = (typeof X264_PRESETS)[number];

export const PIXEL_FORMATS = [
	"yuv420p",
	"yuva420p",
	"yuv422p",
	"yuv444p",
	"yuv420p10le",
	"yuv422p10le",
	"yuv444p10le",
	"yuva444p10le",
] as const;
/** Output pixel format. */
export type PixelFormat = (typeof PIXEL_FORMATS)[number];

export const COLOR_SPACES = ["default", "bt601", "bt709", "bt2020-ncl"] as const;
/** Colour space of the encoded video. */
export type ColorSpace = (typeof COLOR_SPACES)[number];

export const CODECS = [
	"h264",
	"h265",
	"vp8",
	"vp9",
	"av1",
	"prores",
	"h264-mkv",
	"h264-ts",
	"gif",
	"mp3",
	"wav",
	"aac",
] as const;
/** Codec names accepted by Remotion's `renderMedia`; Motio M1 encodes `h264` only. */
export type Codec = (typeof CODECS)[number];

function invalid(message: string): MotioError {
	return new MotioError("E_INVALID_OPTION", message);
}

/** Default concurrency: half of the CPU threads, at least 1, at most 8. */
export function defaultConcurrency(cpus = availableParallelism()): number {
	return Math.max(1, Math.min(8, Math.floor(cpus / 2)));
}

/**
 * Resolves `concurrency`: a number of pages, a percentage of CPU threads such as `"50%"`, or
 * `null`/`undefined` for the default. The result is between 1 and the number of CPU threads.
 */
export function resolveConcurrency(
	value: number | string | null | undefined,
	cpus = availableParallelism(),
): number {
	if (value === null || value === undefined) return defaultConcurrency(cpus);
	let n: number;
	if (typeof value === "string") {
		const m = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(value);
		if (m) {
			const pct = Number(m[1]);
			if (pct <= 0 || pct > 100) {
				throw invalid(`concurrency "${value}" must be a percentage between 0% and 100%`);
			}
			return Math.max(1, Math.floor((cpus * pct) / 100));
		}
		if (!/^\s*\d+\s*$/.test(value)) {
			throw invalid(`concurrency "${value}" must be a number or a percentage such as "50%"`);
		}
		n = Number(value);
	} else {
		n = value;
	}
	if (!Number.isInteger(n) || n < 1) {
		throw invalid(`concurrency must be an integer of at least 1, got ${value}`);
	}
	if (n > cpus) {
		throw invalid(
			`concurrency ${n} exceeds the ${cpus} CPU threads of this machine; use at most ${cpus}`,
		);
	}
	return n;
}

/**
 * Expands `frameRange` and `everyNthFrame` into the composition frames to render, ascending.
 * Ranges are inclusive; an open range (`[start, null]`) runs to the last frame and may only be
 * last.
 */
export function resolveFrames(
	frameRange: FrameRange | null | undefined,
	everyNthFrame: number | undefined,
	durationInFrames: number,
): number[] {
	const nth = everyNthFrame ?? 1;
	if (!Number.isInteger(nth) || nth < 1) {
		throw invalid(`everyNthFrame must be an integer of at least 1, got ${everyNthFrame}`);
	}
	const last = durationInFrames - 1;
	const check = (f: number, what: string) => {
		if (!Number.isInteger(f) || f < 0 || f > last) {
			throw invalid(`${what} ${f} is outside the composition (frames 0 to ${last})`);
		}
	};
	let ranges: [number, number][];
	if (frameRange === null || frameRange === undefined) {
		ranges = [[0, last]];
	} else if (typeof frameRange === "number") {
		check(frameRange, "frameRange");
		ranges = [[frameRange, frameRange]];
	} else if (isSingleRange(frameRange)) {
		ranges = [closeRange(frameRange, last, check)];
	} else {
		const list = frameRange as readonly (readonly [number, number | null])[];
		if (list.length === 0) throw invalid("frameRange must not be an empty array");
		ranges = list.map((r, i) => {
			if (r[1] === null && i !== list.length - 1) {
				throw invalid("frameRange: an open range ([start, null]) may only be the last range");
			}
			return closeRange(r, last, check);
		});
		for (let i = 1; i < ranges.length; i++) {
			const prev = ranges[i - 1] as [number, number];
			const cur = ranges[i] as [number, number];
			if (cur[0] <= prev[1]) {
				throw invalid(
					`frameRange: ranges must be ordered and not overlap, got [${prev}] then [${cur}]`,
				);
			}
		}
	}
	const all: number[] = [];
	for (const [a, b] of ranges) for (let f = a; f <= b; f++) all.push(f);
	return all.filter((_, i) => i % nth === 0);
}

function isSingleRange(r: FrameRange): r is readonly [number, number] | readonly [number, null] {
	return Array.isArray(r) && r.length === 2 && typeof r[0] === "number" && !Array.isArray(r[1]);
}

function closeRange(
	r: readonly [number, number | null],
	last: number,
	check: (f: number, what: string) => void,
): [number, number] {
	const [start, end] = r;
	check(start, "frameRange start");
	const e = end === null ? last : end;
	check(e, "frameRange end");
	if (e < start) throw invalid(`frameRange [${start}, ${e}] ends before it starts`);
	return [start, e];
}

/** Validates `jpegQuality` against `imageFormat`; returns the quality to use (default 80). */
export function resolveJpegQuality(imageFormat: string, jpegQuality: number | undefined): number {
	if (jpegQuality === undefined) return 80;
	if (imageFormat !== "jpeg") {
		throw invalid(`jpegQuality is only valid with imageFormat "jpeg", not "${imageFormat}"`);
	}
	if (!Number.isInteger(jpegQuality) || jpegQuality < 0 || jpegQuality > 100) {
		throw invalid(`jpegQuality must be an integer between 0 and 100, got ${jpegQuality}`);
	}
	return jpegQuality;
}

/** Validates `crf` for H.264 (1 to 51); default 18. */
export function resolveCrf(crf: number | null | undefined): number {
	if (crf === null || crf === undefined) return 18;
	if (!Number.isInteger(crf) || crf < 1 || crf > 51) {
		throw invalid(`crf for h264 must be an integer between 1 and 51, got ${crf}`);
	}
	return crf;
}

/** Validates `scale`; default 1. */
export function resolveScale(scale: number | undefined): number {
	if (scale === undefined) return 1;
	if (!Number.isFinite(scale) || scale <= 0 || scale > 16) {
		throw invalid(`scale must be a number greater than 0 and at most 16, got ${scale}`);
	}
	return scale;
}

/** Validates a value against a list of allowed strings. */
export function oneOf<T extends string>(
	name: string,
	value: string | undefined,
	allowed: readonly T[],
	fallback: T,
): T {
	if (value === undefined) return fallback;
	if (!(allowed as readonly string[]).includes(value)) {
		throw invalid(
			`${name} must be one of ${allowed.map((v) => `"${v}"`).join(", ")}, got "${value}"`,
		);
	}
	return value as T;
}

/** Output size of a frame for a composition size and `scale`. */
export function scaledSize(
	width: number,
	height: number,
	scale: number,
): { width: number; height: number } {
	return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Throws `E_ODD_DIMENSIONS` when the pixel format's chroma subsampling needs even sizes. */
export function assertDimensionsFit(width: number, height: number, pixelFormat: PixelFormat): void {
	const horizontal = /^yuva?4(20|22)p/.test(pixelFormat);
	const vertical = /^yuva?420p/.test(pixelFormat);
	if ((horizontal && width % 2 !== 0) || (vertical && height % 2 !== 0)) {
		throw new MotioError(
			"E_ODD_DIMENSIONS",
			`The output is ${width}x${height}, but pixel format ${pixelFormat} needs an even ${
				vertical ? "width and height" : "width"
			}. Change the composition size or scale, or use yuv444p.`,
			{ details: { width, height, pixelFormat } },
		);
	}
}

/** Checks that input props are a JSON object and returns them as serialisable data. */
export function resolveInputProps(inputProps: unknown): Record<string, unknown> {
	if (inputProps === undefined || inputProps === null) return {};
	if (typeof inputProps !== "object" || Array.isArray(inputProps)) {
		throw invalid("inputProps must be a JSON object");
	}
	let json: string;
	try {
		json = JSON.stringify(inputProps);
	} catch (err) {
		throw new MotioError("E_INVALID_OPTION", "inputProps must be serialisable to JSON", {}, err);
	}
	return JSON.parse(json) as Record<string, unknown>;
}

/** Checks that environment variables are string to string. */
export function resolveEnvVariables(
	env: Record<string, string> | undefined,
): Record<string, string> {
	if (env === undefined) return {};
	for (const [k, v] of Object.entries(env)) {
		if (typeof v !== "string") throw invalid(`envVariables.${k} must be a string`);
	}
	return { ...env };
}

/** Validates `timeoutInMilliseconds`; default 30000. */
export function resolveTimeout(ms: number | undefined): number {
	if (ms === undefined) return 30_000;
	if (!Number.isFinite(ms) || ms <= 0) {
		throw invalid(`timeoutInMilliseconds must be a positive number, got ${ms}`);
	}
	return ms;
}
