import type {
	createBundle,
	loadEnvVariables,
	loadRemotionConfig,
	resolveEntryPoint,
} from "@motiojs/bundler";
import type { createCompatibilityReport } from "@motiojs/compat";
import type { CliIo, Reporter } from "./io.js";
import type { RendererApi } from "./renderer-api.js";

/** The bundler functions the CLI calls; injectable for tests. */
export interface BundlerApi {
	createBundle: typeof createBundle;
	loadRemotionConfig: typeof loadRemotionConfig;
	loadEnvVariables: typeof loadEnvVariables;
	resolveEntryPoint: typeof resolveEntryPoint;
}

/** Dependencies of every command. */
export interface CliDeps {
	/** Loaded on first use, so `--help` and argument errors never load the renderer. */
	renderer: () => Promise<RendererApi>;
	bundler: BundlerApi;
	compatibilityReport: typeof createCompatibilityReport;
	/** FFmpeg executable used to decode frames and build contact sheets. */
	ffmpegPath: string;
	/** Registers a handler for Ctrl+C; returns a function that unregisters it. */
	onInterrupt: (handler: () => void) => () => void;
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
}
