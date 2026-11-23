import { spawn } from "node:child_process";

/** Output of a finished process. */
export interface RunResult {
	code: number | null;
	stdout: string;
	stderr: string;
}

/**
 * Runs `command` without a shell. With `print`, its output goes to this process's stdout and
 * stderr as it comes; it is collected either way. Rejects when it cannot start or is aborted.
 */
export function run(
	command: string,
	args: readonly string[],
	options: {
		cwd?: string;
		print: boolean;
		signal?: AbortSignal;
		onStderr?: (text: string) => void;
	},
): Promise<RunResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			...(options.cwd ? { cwd: options.cwd } : {}),
			...(options.signal ? { signal: options.signal } : {}),
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
			stdout += chunk;
			if (options.print) process.stdout.write(chunk);
		});
		child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
			stderr += chunk;
			options.onStderr?.(chunk);
			if (options.print) process.stderr.write(chunk);
		});
		child.on("error", reject);
		child.on("close", (code) => resolve({ code, stdout, stderr }));
	});
}

/** Runs `command` and rejects with its output when it exits with an error. */
export async function runOrThrow(
	command: string,
	args: readonly string[],
	options: { cwd?: string; print: boolean; signal?: AbortSignal },
): Promise<void> {
	const result = await run(command, args, options);
	if (result.code !== 0) {
		throw new Error(
			`\`${[command, ...args].join(" ")}\` exited with code ${result.code}:\n${result.stderr || result.stdout}`,
		);
	}
}
