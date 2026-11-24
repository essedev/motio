import type { LogLevel } from "@motiojs/compat/config";

/** Where the CLI writes and the environment it runs in; injectable for tests. */
export interface CliIo {
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	cwd: string;
	env: Record<string, string | undefined>;
	/** True when stderr is a terminal: progress then rewrites one line. */
	isTTY: boolean;
}

const LEVELS: Record<LogLevel, number> = { trace: 0, verbose: 1, info: 2, warn: 3, error: 4 };

/** A warning the renderer returns with a render result (`W_FONT_FALLBACK`, ...). */
export interface RenderWarning {
	code: string;
	message: string;
	frame?: number;
}

/**
 * The warnings of a render result, read defensively: a renderer without them, or a malformed
 * entry, gives none.
 */
export function renderWarningsOf(result: unknown): RenderWarning[] {
	const list = (result as { warnings?: unknown } | null | undefined)?.warnings;
	if (!Array.isArray(list)) return [];
	return list.flatMap((item): RenderWarning[] => {
		const { code, message, frame } = (item ?? {}) as Record<string, unknown>;
		if (typeof code !== "string" || typeof message !== "string") return [];
		return [{ code, message, ...(typeof frame === "number" ? { frame } : {}) }];
	});
}

/**
 * Human output goes to stderr (progress, warnings) and stdout (the result); in JSON mode the
 * only thing on stdout is the final JSON object, and nothing is printed on stderr except
 * verbose logs when asked for.
 */
export class Reporter {
	readonly warnings: string[] = [];
	/** Warnings from render results, deduplicated across the renders of a command. */
	readonly renderWarnings: RenderWarning[] = [];
	private lastProgressLine = "";
	private progressOpen = false;

	constructor(
		private readonly io: CliIo,
		readonly json: boolean,
		readonly logLevel: LogLevel = "info",
	) {}

	private enabled(level: LogLevel): boolean {
		return LEVELS[level] >= LEVELS[this.logLevel];
	}

	private endProgress(): void {
		if (this.progressOpen) {
			this.io.stderr("\n");
			this.progressOpen = false;
			this.lastProgressLine = "";
		}
	}

	/** One-line status in human mode. */
	info(message: string): void {
		if (this.json || !this.enabled("info")) return;
		this.endProgress();
		this.io.stderr(`${message}\n`);
	}

	/** Verbose diagnostics (browser logs...), printed in both modes on stderr when enabled. */
	verbose(message: string): void {
		if (!this.enabled("verbose")) return;
		this.endProgress();
		this.io.stderr(`${message}\n`);
	}

	/** Recorded for the JSON result; printed in human mode. */
	warn(message: string): void {
		this.warnings.push(message);
		if (this.json || !this.enabled("warn")) return;
		this.endProgress();
		this.io.stderr(`warning: ${message}\n`);
	}

	/**
	 * Records the warnings of a render result and prints each new one: `warning [W_FONT_FALLBACK]:
	 * ... (frame 12)`. The same code and message seen again (another run of a check) is skipped.
	 */
	renderResult(result: unknown): void {
		for (const warning of renderWarningsOf(result)) this.renderWarning(warning);
	}

	/** Records and prints one render warning, once per code and message. */
	renderWarning(warning: RenderWarning): void {
		if (this.renderWarnings.some((w) => w.code === warning.code && w.message === warning.message)) {
			return;
		}
		this.renderWarnings.push(warning);
		const text = `${warning.message}${warning.frame !== undefined ? ` (frame ${warning.frame})` : ""}`;
		this.warnings.push(`[${warning.code}] ${text}`);
		if (this.json || !this.enabled("warn")) return;
		this.endProgress();
		this.io.stderr(`warning [${warning.code}]: ${text}\n`);
	}

	/**
	 * Progress of a phase, `fraction` from 0 to 1. Rewrites one line on a terminal; elsewhere (CI
	 * logs) prints a line every 10%.
	 */
	progress(label: string, fraction: number, detail = ""): void {
		if (this.json || !this.enabled("info")) return;
		const percent = Math.max(0, Math.min(100, Math.round(fraction * 100)));
		const line = `${label} ${percent}%${detail ? ` ${detail}` : ""}`;
		if (line === this.lastProgressLine) return;
		if (this.io.isTTY) {
			this.io.stderr(`\r\x1b[2K${line}`);
			this.progressOpen = true;
		} else if (percent === 100 || percent % 10 === 0) {
			this.io.stderr(`${line}\n`);
		}
		this.lastProgressLine = line;
	}

	/** Prints the final human-readable lines on stdout. */
	result(lines: readonly string[]): void {
		this.endProgress();
		if (lines.length > 0) this.io.stdout(`${lines.join("\n")}\n`);
	}

	/** Prints the final JSON object on stdout. */
	resultJson(value: unknown): void {
		this.endProgress();
		this.io.stdout(`${JSON.stringify(value)}\n`);
	}

	finish(): void {
		this.endProgress();
	}
}
