import type { CompositionInfo } from "../protocol.js";
import type { VideoConfig } from "../timeline/contexts.js";
import type { CalculateMetadataResult, RegisteredComposition } from "./types.js";
import { validateFps, validatePositiveInteger, validatePropsObject } from "./validate.js";

/** The protocol view of a registered composition, before `calculateMetadata`. */
export function toCompositionInfo(entry: RegisteredComposition): CompositionInfo {
	return {
		id: entry.id,
		width: entry.width ?? 0,
		height: entry.height ?? 0,
		fps: entry.fps ?? 0,
		durationInFrames: entry.durationInFrames ?? 0,
		defaultProps: entry.defaultProps,
		hasCalculateMetadata: entry.calculateMetadata !== null,
		isStill: entry.isStill,
		defaultCodec: null,
		defaultOutName: null,
		defaultPixelFormat: null,
		defaultVideoImageFormat: null,
		defaultProResProfile: null,
		defaultSampleRate: null,
	};
}

/** Raised when `calculateMetadata()` throws or returns invalid metadata. */
export class CalculateMetadataError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "CalculateMetadataError";
	}
}

/** Options of `resolveComposition()`. */
export interface ResolveOptions {
	signal: AbortSignal;
	isRendering: boolean;
	/** Receives warnings (invalid props against the schema). Defaults to `console.warn`. */
	warn?: (message: string) => void;
}

function optionalString(value: unknown, where: string): string | null {
	if (value === undefined || value === null) return null;
	if (typeof value !== "string") throw new CalculateMetadataError(`${where} must be a string.`);
	return value;
}

/**
 * Merges the input props over the default props (shallowly), checks them against the schema
 * (a warning, as in Remotion 4), runs `calculateMetadata()` and validates the result.
 */
export async function resolveComposition(
	entry: RegisteredComposition,
	inputProps: Record<string, unknown>,
	options: ResolveOptions,
): Promise<VideoConfig> {
	const warn = options.warn ?? ((m: string) => console.warn(m));
	const props = { ...entry.defaultProps, ...inputProps };
	if (entry.schema) {
		const parsed = entry.schema.safeParse(props);
		if (!parsed.success) {
			const issues = parsed.error?.issues ?? [];
			const lines = issues.map(
				(i) => `  - ${i.path.map(String).join(".") || "(root)"}: ${i.message}`,
			);
			warn(
				`The props of composition "${entry.id}" do not match its schema; rendering with them anyway:\n${lines.join("\n")}`,
			);
		}
	}

	let result: CalculateMetadataResult<Record<string, unknown>> = {};
	if (entry.calculateMetadata) {
		let returned: unknown;
		try {
			returned = await entry.calculateMetadata({
				defaultProps: entry.defaultProps,
				props,
				abortSignal: options.signal,
				compositionId: entry.id,
				isRendering: options.isRendering,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			throw new CalculateMetadataError(
				`calculateMetadata() of composition "${entry.id}" failed: ${message}`,
				{ cause: err },
			);
		}
		if (returned !== undefined && returned !== null) {
			if (typeof returned !== "object" || Array.isArray(returned)) {
				throw new CalculateMetadataError(
					`calculateMetadata() of composition "${entry.id}" must return an object, got ${String(returned)}.`,
				);
			}
			result = returned as CalculateMetadataResult<Record<string, unknown>>;
		}
	}

	const where = (field: string) => `The "${field}" of composition "${entry.id}"`;
	const width = result.width ?? entry.width;
	const height = result.height ?? entry.height;
	const fps = result.fps ?? entry.fps;
	const durationInFrames = result.durationInFrames ?? entry.durationInFrames;
	const finalProps = result.props ?? props;
	try {
		validatePositiveInteger(width, where("width"));
		validatePositiveInteger(height, where("height"));
		validateFps(fps, where("fps"));
		validatePositiveInteger(durationInFrames, where("durationInFrames"));
		validatePropsObject(finalProps, `The props returned by calculateMetadata() for "${entry.id}"`);
	} catch (err) {
		throw new CalculateMetadataError((err as Error).message);
	}
	const sampleRate = result.defaultSampleRate;
	if (sampleRate !== undefined && (typeof sampleRate !== "number" || sampleRate <= 0)) {
		throw new CalculateMetadataError(`${where("defaultSampleRate")} must be a positive number.`);
	}
	return {
		id: entry.id,
		width,
		height,
		fps,
		durationInFrames,
		defaultProps: entry.defaultProps,
		props: finalProps,
		defaultCodec: optionalString(result.defaultCodec, where("defaultCodec")),
		defaultOutName: optionalString(result.defaultOutName, where("defaultOutName")),
		defaultVideoImageFormat: optionalString(
			result.defaultVideoImageFormat,
			where("defaultVideoImageFormat"),
		),
		defaultPixelFormat: optionalString(result.defaultPixelFormat, where("defaultPixelFormat")),
		defaultProResProfile: optionalString(
			result.defaultProResProfile,
			where("defaultProResProfile"),
		),
		defaultSampleRate: sampleRate ?? null,
	};
}
