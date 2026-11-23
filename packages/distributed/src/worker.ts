import type { RenderChunkOptions, VideoConfig } from "@motiojs/renderer";
import type { Chunk } from "./plan.js";

/**
 * Render settings a worker applies to every chunk: the options of `renderChunk()` that are plain
 * data, so a job can travel to another process or machine as JSON.
 */
export type ChunkRenderSettings = Omit<
	RenderChunkOptions,
	| "serveUrl"
	| "composition"
	| "frameRange"
	| "outputLocation"
	| "cancelSignal"
	| "onProgress"
	| "onBrowserLog"
>;

/** What a worker needs to render one chunk. Plain data, serialisable as JSON. */
export interface ChunkJob {
	/** Bundle directory or URL the worker can open. */
	serveUrl: string;
	/** The resolved composition (after `calculateMetadata`), rendered as given. */
	composition: VideoConfig;
	chunk: Chunk;
	/** Where the worker writes its video-only chunk (a path, or a URL a remote worker uploads to). */
	output: string;
	settings: ChunkRenderSettings;
}

/** Hooks the orchestrator passes with each job. */
export interface ChunkJobControl {
	/** Aborted when the render is cancelled or another chunk failed. */
	signal?: AbortSignal;
	/** Frames of the chunk rendered so far. */
	onProgress?: (renderedFrames: number) => void;
}

/**
 * The seam between orchestration and where chunks render. `LocalChunkWorker` runs each chunk in
 * a child process; adapters for AWS Lambda, Cloud Run or Kubernetes implement the same method
 * (render `job.chunk` with `renderChunk()` from `@motiojs/renderer` and make `job.output`
 * available to the orchestrator), and planning, audio and assembly stay the same.
 */
export interface ChunkWorker {
	renderChunk(job: ChunkJob, control?: ChunkJobControl): Promise<{ output: string }>;
}
