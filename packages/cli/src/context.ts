import type {
	createBundle,
	loadEnvVariables,
	loadRemotionConfig,
	resolveEntryPoint,
	startDevServer,
} from "@motiojs/bundler";
import type { createCompatibilityReport } from "@motiojs/compat";
import type { CliIo, Reporter } from "./io.js";
import type {
	DistributedApi,
	RendererApi,
	ResolvedFfmpeg,
	ResolveFfmpegOptions,
} from "./renderer-api.js";

/** The bundler functions the CLI calls; injectable for tests. */
export interface BundlerApi {
	createBundle: typeof createBundle;
	loadRemotionConfig: typeof loadRemotionConfig;
	loadEnvVariables: typeof loadEnvVariables;
	resolveEntryPoint: typeof resolveEntryPoint;
	startDevServer: typeof startDevServer;
}

/** Dependencies of every command. */
export interface CliDeps {
	/** Loaded on first use, so `--help` and argument errors never load the renderer. */
	renderer: () => Promise<RendererApi>;
	/** Chunked rendering (`motio render --chunks`), loaded on first use. */
	distributed?: () => Promise<DistributedApi>;
	bundler: BundlerApi;
	compatibilityReport: typeof createCompatibilityReport;
	/**
	 * Resolves FFmpeg as the renderer does (D-065): `MOTIO_FFMPEG`, else `@motiojs/ffmpeg` when it
	 * is installed, else `ffmpeg` on PATH. Resolves to null only with `download: false` for an
	 * installed package whose build is not downloaded yet.
	 */
	resolveFfmpeg: (options?: ResolveFfmpegOptions) => Promise<ResolvedFfmpeg | null>;
	/** Registers a handler for Ctrl+C; returns a function that unregisters it. */
	onInterrupt: (handler: () => void) => () => void;
	/**
	 * Registers a handler for termination signals (SIGTERM, SIGHUP), used by long-running
	 * commands such as `dev` to shut down cleanly; returns a function that unregisters it.
	 */
	onTerminate?: (handler: () => void) => () => void;
}

export interface CommandContext extends CliDeps {
	io: CliIo;
	reporter: Reporter;
	/** Removes temporary files when the command ends. */
	cleanup: Array<() => Promise<void>>;
}

/** What a command returns: the JSON result (without `ok`/`command`) and human lines. */
export interface CommandResult {
	json: Record<string, unknown>;
	human: string[];
	/** Defaults to 0. */
	exitCode?: number;
	/**
	 * The command already printed its JSON result (a long-running command reports as soon as
	 * it is ready), so nothing more goes to stdout in JSON mode.
	 */
	jsonPrinted?: boolean;
}
