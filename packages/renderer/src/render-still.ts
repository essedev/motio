import { writeFile } from "node:fs/promises";
import { type CancelSignal, toAbortController } from "./cancel.js";
import { MotioError } from "./errors.js";
import { oneOf, resolveScale, resolveTimeModel } from "./options.js";
import { checkOverwrite, prepareOutput } from "./output.js";
import { compositionPageFactory } from "./page-factory.js";
import { DEFAULT_CRASH_RETRIES, runPool } from "./pool.js";
import {
	type BrowserSessionOptions,
	openSession,
	type VideoConfig,
	validateComposition,
} from "./session.js";
import type { RenderWarning } from "./warnings.js";

/** Options of `renderStill()`. */
export interface RenderStillOptions extends BrowserSessionOptions {
	composition: VideoConfig;
	/** File to write; null or unset returns the image as a buffer. */
	output?: string | null;
	/** Zero-based frame; negative counts from the end (-1 is the last frame). Default 0. */
	frame?: number;
	/** Default `png`. `pdf` is not supported yet. */
	imageFormat?: "png" | "jpeg" | "webp" | "pdf";
	jpegQuality?: number;
	scale?: number;
	/** Default true. */
	overwrite?: boolean;
	cancelSignal?: CancelSignal;
}

/** Result of `renderStill()`. */
export interface RenderStillResult {
	/** The image, or null when it was written to `output`. */
	buffer: Buffer | null;
	contentType: string;
	/** Motio extension: warnings the page reported, each once (see `RenderWarning`). */
	warnings: RenderWarning[];
}

const CONTENT_TYPES = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;

/** Renders one frame of a composition to an image. */
export async function renderStill(options: RenderStillOptions): Promise<RenderStillResult> {
	const { composition } = options;
	validateComposition(composition);
	const imageFormat = oneOf(
		"imageFormat",
		options.imageFormat,
		["png", "jpeg", "webp", "pdf"] as const,
		"png",
	);
	if (imageFormat === "pdf") {
		throw new MotioError(
			"E_INVALID_OPTION",
			'imageFormat "pdf" is not supported yet; use png, jpeg or webp',
		);
	}
	if (options.jpegQuality !== undefined && imageFormat !== "jpeg") {
		throw new MotioError(
			"E_INVALID_OPTION",
			`jpegQuality is only valid with imageFormat "jpeg", not "${imageFormat}"`,
		);
	}
	const quality = options.jpegQuality ?? 80;
	if (!Number.isInteger(quality) || quality < 0 || quality > 100) {
		throw new MotioError(
			"E_INVALID_OPTION",
			`jpegQuality must be an integer between 0 and 100, got ${quality}`,
		);
	}
	const scale = resolveScale(options.scale);
	const requested = options.frame ?? 0;
	const frame = requested < 0 ? composition.durationInFrames + requested : requested;
	if (!Number.isInteger(frame) || frame < 0 || frame >= composition.durationInFrames) {
		throw new MotioError(
			"E_INVALID_OPTION",
			`frame ${requested} is outside the composition (0 to ${composition.durationInFrames - 1}, or negative from the end)`,
			{
				composition: composition.id,
				details: {
					option: "frame",
					value: requested,
					min: -composition.durationInFrames,
					max: composition.durationInFrames - 1,
				},
			},
		);
	}
	if (options.output) await checkOverwrite(options.output, options.overwrite ?? true);

	const timeModel = resolveTimeModel(options.timeModel, composition);
	const controller = toAbortController(options.cancelSignal, "renderStill");
	const session = await openSession(options);
	try {
		let image: Buffer | undefined;
		const openPage = compositionPageFactory(session, composition, {
			width: composition.width,
			height: composition.height,
			scale,
			transparent: imageFormat !== "jpeg",
			concurrency: 1,
			timeModel,
		});
		await runPool({
			frames: [frame],
			concurrency: 1,
			openPage,
			format: imageFormat,
			quality,
			recycleEveryNFrames: 0,
			crashRetries: DEFAULT_CRASH_RETRIES,
			signal: controller.signal,
			onFrame: async (f) => {
				image = f.image;
			},
		});
		if (!image)
			throw new MotioError("E_CAPTURE_FAILED", `No image was captured for frame ${frame}`);
		if (options.output) {
			// Same as renderMedia: create the directory, write to a temporary file, then rename,
			// so a cancel or crash never leaves a truncated image at the output path.
			const out = await prepareOutput(options.output, options.overwrite ?? true, `.${imageFormat}`);
			try {
				await writeFile(out.temp, image);
				await out.commit();
			} catch (err) {
				await out.discard();
				throw err;
			}
			return {
				buffer: null,
				contentType: CONTENT_TYPES[imageFormat],
				warnings: session.warnings.list(),
			};
		}
		return {
			buffer: image,
			contentType: CONTENT_TYPES[imageFormat],
			warnings: session.warnings.list(),
		};
	} finally {
		await session.close();
	}
}
