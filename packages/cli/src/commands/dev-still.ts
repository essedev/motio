import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { BundleOptions, DevStillRequest, DevStillResult } from "@motiojs/bundler";
import { MotioError } from "@motiojs/compat";
import type { CommandContext } from "../context.js";
import { renderWarningsOf } from "../io.js";
import { ensureBrowserWithProgress } from "../project.js";
import type { SessionOptions } from "../renderer-api.js";

/** What the render check needs to build bundles and render. */
export interface DevStillRendererOptions {
	ctx: CommandContext;
	/** Options of every production build; `outDir` is set here. */
	bundleOptions: Omit<BundleOptions, "outDir" | "onProgress">;
	/** Renderer options (browser, timeout, logging); `serveUrl` is set per bundle. */
	session: Omit<SessionOptions, "serveUrl" | "inputProps">;
	/** Directory owned by the dev session: bundles and stills are written below it. */
	workDir: string;
}

/**
 * Renders stills for the preview page's render check with `motio still` semantics: a
 * production bundle of the project (rebuilt only after a source change), `selectComposition`
 * with the page's props (so `calculateMetadata` runs as in a render) and `renderStill` as PNG.
 * Requests run one at a time; a newer request waits for the previous one.
 */
export class DevStillRenderer {
	private dirty = true;
	private serveUrl: string | null = null;
	private queue: Promise<unknown> = Promise.resolve();
	private count = 0;
	private browserReady = false;

	constructor(private readonly options: DevStillRendererOptions) {}

	/** Marks the bundle stale; the next still rebuilds it. */
	invalidate(): void {
		this.dirty = true;
	}

	/** Renders one still; serialised with the other requests. */
	render(request: DevStillRequest, signal: AbortSignal): Promise<DevStillResult> {
		const run = this.queue.then(() => this.renderNow(request, signal));
		this.queue = run.catch(() => undefined);
		return run;
	}

	private async ensureBundle(): Promise<string> {
		if (!this.dirty && this.serveUrl) return this.serveUrl;
		const { ctx, bundleOptions, workDir } = this.options;
		// Cleared first, so a source change during the build marks the next one stale again.
		this.dirty = false;
		const started = Date.now();
		try {
			const result = await ctx.bundler.createBundle({
				...bundleOptions,
				outDir: join(workDir, "bundle"),
			});
			this.serveUrl = result.serveUrl;
		} catch (error) {
			this.dirty = true;
			throw error;
		}
		ctx.reporter.verbose(`Render check: bundled in ${Date.now() - started} ms`);
		return this.serveUrl;
	}

	private async renderNow(request: DevStillRequest, signal: AbortSignal): Promise<DevStillResult> {
		if (signal.aborted) throw abortError();
		const { ctx, session, workDir } = this.options;
		const started = Date.now();
		const serveUrl = await this.ensureBundle();
		if (!this.browserReady) {
			await ensureBrowserWithProgress(ctx, session);
			this.browserReady = true;
		}
		const renderer = await ctx.renderer();
		const composition = await renderer.selectComposition({
			...session,
			serveUrl,
			id: request.compositionId,
			inputProps: request.inputProps,
		});
		if (request.frame >= composition.durationInFrames) {
			throw new MotioError(
				"E_INVALID_ARGUMENT",
				`Frame ${request.frame} is outside ${composition.id} (frames 0 to ${composition.durationInFrames - 1}).`,
				{ frame: request.frame, durationInFrames: composition.durationInFrames },
			);
		}
		const stills = join(workDir, "stills");
		await mkdir(stills, { recursive: true });
		const output = join(stills, `${++this.count}-${composition.id}-${request.frame}.png`);
		const { cancelSignal, cancel } = renderer.makeCancelSignal();
		const onAbort = () => cancel();
		signal.addEventListener("abort", onAbort);
		try {
			const result = await renderer.renderStill({
				...session,
				serveUrl,
				inputProps: request.inputProps,
				composition,
				output,
				frame: request.frame,
				imageFormat: "png",
				overwrite: true,
				cancelSignal,
			});
			// The preview page shows the still; the terminal running motio dev shows why it may look off.
			for (const warning of renderWarningsOf(result)) {
				ctx.reporter.warn(
					`Render check [${warning.code}]: ${warning.message}${warning.frame !== undefined ? ` (frame ${warning.frame})` : ""}`,
				);
			}
		} finally {
			signal.removeEventListener("abort", onAbort);
		}
		const durationMs = Date.now() - started;
		ctx.reporter.verbose(
			`Render check: frame ${request.frame} of ${composition.id} in ${durationMs} ms`,
		);
		return {
			file: output,
			frame: request.frame,
			width: composition.width,
			height: composition.height,
			durationMs,
		};
	}
}

function abortError(): MotioError {
	return new MotioError("E_CANCELLED", "The render check was cancelled.");
}
