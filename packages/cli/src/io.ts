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

/**
 * Human output goes to stderr (progress, warnings) and stdout (the result); in JSON mode the
 * only thing on stdout is the final JSON object, and nothing is printed on stderr except
 * verbose logs when asked for.
 */
export class Reporter {
	readonly warnings: string[] = [];
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

	/** Progress of a phase, `fraction` from 0 to 1. Rewrites one line on a terminal. */
	progress(label: string, fraction: number, detail = ""): void {
		if (this.json || !this.enabled("info")) return;
		const percent = Math.max(0, Math.min(100, Math.round(fraction * 100)));
		const line = `${label} ${percent}%${detail ? ` ${detail}` : ""}`;
		if (line === this.lastProgressLine) return;
		if (this.io.isTTY) {
			this.io.stderr(`\r\x1b[2K${line}`);
			this.progressOpen = true;
		} else if (percent === 100 || percent % 25 === 0) {
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
