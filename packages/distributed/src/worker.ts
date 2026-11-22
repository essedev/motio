import type { Chunk } from "./plan.js";

/** What a worker needs to render one chunk. */
export interface ChunkJob {
	serveUrl: string;
	compositionId: string;
	inputProps: Record<string, unknown>;
	chunk: Chunk;
	/** Where the worker writes its video-only MPEG-TS chunk (a path or a URL it can upload to). */
	output: string;
}

/**
 * The seam between orchestration and where chunks render. Local processes, AWS Lambda, Cloud Run
 * and Kubernetes implement this interface; planning and assembly stay the same.
 */
export interface ChunkWorker {
	renderChunk(job: ChunkJob): Promise<{ output: string }>;
}
