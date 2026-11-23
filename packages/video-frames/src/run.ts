import { type ChildProcess, spawn } from "node:child_process";

/** Options of `run()`. */
export interface RunOptions {
	/** Kills the process (SIGKILL) and rejects after this many milliseconds. Default: no limit. */
	timeoutMs?: number;
	/**
	 * The running process is added here and removed when it exits, so its owner can kill every
	 * process it started when it closes.
	 */
	track?: Set<ChildProcess>;
}

/** How long FFmpeg waits on a stalled network read before it fails (`-rw_timeout`), in ms. */
export const NETWORK_READ_TIMEOUT_MS = 30_000;

/**
 * Input options for `src`: a network source gets `-rw_timeout`, so a server that stops sending
 * fails the read instead of blocking FFmpeg forever. Place them before `-i`.
 */
export function networkInputArgs(src: string): string[] {
	return /^[a-z][a-z0-9+.-]*:\/\//i.test(src) && !/^file:/i.test(src)
		? ["-rw_timeout", String(NETWORK_READ_TIMEOUT_MS * 1000)]
		: [];
}

/** Runs a command and collects stdout as a Buffer; rejects with stderr on a non-zero exit. */
export function run(
	cmd: string,
	args: readonly string[],
	options: RunOptions = {},
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
		options.track?.add(child);
		const out: Buffer[] = [];
		let err = "";
		let timedOut = false;
		const timer =
			options.timeoutMs === undefined
				? undefined
				: setTimeout(() => {
						timedOut = true;
						child.kill("SIGKILL");
					}, options.timeoutMs);
		child.stdout.on("data", (c: Buffer) => out.push(c));
		child.stderr.on("data", (c: Buffer) => {
			err += c.toString();
		});
		child.on("error", (e) => {
			clearTimeout(timer);
			options.track?.delete(child);
			reject(e);
		});
		child.on("close", (code, signal) => {
			clearTimeout(timer);
			options.track?.delete(child);
			if (code === 0) resolve(Buffer.concat(out));
			else if (timedOut) reject(new Error(`${cmd} ran longer than ${options.timeoutMs} ms`));
			else if (signal) reject(new Error(`${cmd} was stopped (${signal})`));
			else reject(new Error(`${cmd} exited with ${code}: ${err.trim()}`));
		});
	});
}
