import { spawn } from "node:child_process";

/** Runs a command, resolving with stderr on success and rejecting with it on failure. */
export function run(cmd: string, args: readonly string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
		let err = "";
		child.stderr.on("data", (c: Buffer) => {
			err += c.toString();
		});
		child.on("error", reject);
		child.on("close", (code) =>
			code === 0 ? resolve(err) : reject(new Error(`${cmd} exited with ${code}: ${err.trim()}`)),
		);
	});
}
