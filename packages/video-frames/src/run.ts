import { spawn } from "node:child_process";

/** Runs a command and collects stdout as a Buffer; rejects with stderr on a non-zero exit. */
export function run(cmd: string, args: readonly string[]): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
		const out: Buffer[] = [];
		let err = "";
		child.stdout.on("data", (c: Buffer) => out.push(c));
		child.stderr.on("data", (c: Buffer) => {
			err += c.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolve(Buffer.concat(out));
			else reject(new Error(`${cmd} exited with ${code}: ${err.trim()}`));
		});
	});
}
