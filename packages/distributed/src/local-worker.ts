import { type ChildProcess, fork } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DistributedError } from "./errors.js";
import type { ChunkJob, ChunkJobControl, ChunkWorker } from "./worker.js";

/** Grace period for a cancelled child to close its browsers before it is killed. */
const CANCEL_GRACE_MS = 10_000;

type Outgoing =
	| { type: "progress"; renderedFrames: number }
	| { type: "done"; output: string }
	| { type: "error"; error: { message: string; code?: string; frame?: number } };

/** The child module, compiled next to this file, or its TypeScript source when run from `src`. */
function childModule(): string {
	const js = fileURLToPath(new URL("./local-worker-child.js", import.meta.url));
	return existsSync(js) ? js : fileURLToPath(new URL("./local-worker-child.ts", import.meta.url));
}

/**
 * Renders each chunk in its own Node child process running `renderChunk()` from
 * `@motiojs/renderer`, so a crash stays in one chunk and chunks render in parallel on all cores.
 * A cancelled job asks its child to cancel (closing its browsers and FFmpeg) and kills it if it
 * has not exited within 10 seconds.
 */
export class LocalChunkWorker implements ChunkWorker {
	private readonly children = new Set<ChildProcess>();

	renderChunk(job: ChunkJob, control: ChunkJobControl = {}): Promise<{ output: string }> {
		const { signal, onProgress } = control;
		if (signal?.aborted) return Promise.reject(signal.reason);
		const child = fork(childModule(), [], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
		this.children.add(child);
		let stderr = "";
		child.stderr?.on("data", (c: Buffer) => {
			stderr = (stderr + c.toString()).slice(-4_000);
		});
		return new Promise<{ output: string }>((resolve, reject) => {
			let result: Outgoing | undefined;
			let killTimer: NodeJS.Timeout | undefined;
			const onAbort = () => {
				if (child.connected) child.send({ type: "cancel" });
				killTimer = setTimeout(() => child.kill("SIGKILL"), CANCEL_GRACE_MS);
			};
			signal?.addEventListener("abort", onAbort, { once: true });
			child.on("message", (message: Outgoing) => {
				if (message.type === "progress") onProgress?.(message.renderedFrames);
				else result = message;
			});
			child.on("error", (err) => {
				result ??= { type: "error", error: { message: err.message } };
			});
			child.on("exit", (code, exitSignal) => {
				this.children.delete(child);
				clearTimeout(killTimer);
				signal?.removeEventListener("abort", onAbort);
				if (result?.type === "done") return resolve({ output: result.output });
				if (signal?.aborted) return reject(signal.reason);
				const error =
					result?.type === "error"
						? result.error
						: {
								message: `the worker process exited with ${exitSignal ?? `code ${code}`}${
									stderr.trim() ? `: ${stderr.trim()}` : ""
								}`,
							};
				reject(
					new DistributedError(
						"E_CHUNK_RENDER",
						`Chunk ${job.chunk.index} (frames ${job.chunk.start} to ${job.chunk.end}) failed: ${error.message}`,
						{
							chunk: job.chunk,
							...("code" in error && error.code ? { cause: error.code } : {}),
							...("frame" in error && error.frame !== undefined ? { frame: error.frame } : {}),
						},
					),
				);
			});
			child.send({ type: "render", job });
		});
	}

	/** Kills every child still running. */
	close(): void {
		for (const child of this.children) child.kill("SIGKILL");
		this.children.clear();
	}
}
