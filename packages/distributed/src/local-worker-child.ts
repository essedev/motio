// Child process of LocalChunkWorker: renders one chunk with @motiojs/renderer and reports back
// over IPC. Self-contained (it only imports the renderer package), so Node can run it from the
// compiled output or, in tests, from the TypeScript source.
import { isMotioError, makeCancelSignal, renderChunk } from "@motiojs/renderer";
import type { ChunkJob } from "./worker.js";

type Incoming = { type: "render"; job: ChunkJob } | { type: "cancel" };

const { cancelSignal, cancel } = makeCancelSignal();
let started = false;

function send(message: unknown): Promise<void> {
	return new Promise((resolve) => {
		if (!process.send) return resolve();
		process.send(message, () => resolve());
	});
}

process.on("message", (message: Incoming) => {
	if (message.type === "cancel") {
		cancel();
		return;
	}
	if (started) return;
	started = true;
	const { job } = message;
	renderChunk({
		...job.settings,
		serveUrl: job.serveUrl,
		composition: job.composition,
		frameRange: [job.chunk.start, job.chunk.end],
		outputLocation: job.output,
		cancelSignal,
		onProgress: ({ renderedFrames }) => {
			void send({ type: "progress", renderedFrames });
		},
	}).then(
		async (result) => {
			await send({ type: "done", output: result.outputLocation });
			process.exit(0);
		},
		async (err: unknown) => {
			await send({
				type: "error",
				error: {
					message: err instanceof Error ? err.message : String(err),
					code: isMotioError(err) ? err.code : undefined,
					frame: isMotioError(err) ? err.frame : undefined,
				},
			});
			process.exit(1);
		},
	);
});
// The parent going away cancels the render, so no browser outlives the orchestrator.
process.on("disconnect", () => cancel());
