# @motiojs/distributed

Chunked rendering for [Motio](https://motio.esse.dev): it splits a video into contiguous frame ranges, renders the chunks in parallel and joins them without re-encoding, while the audio is rendered once for the whole timeline. `motio render --chunks=<n>` (or `--frames-per-chunk=<n>`) does the same from the CLI.

```bash
pnpm add @motiojs/distributed @motiojs/bundler @motiojs/renderer
```

<!-- example: ../../docs/guide/examples/src/packages/distributed.ts#render -->
```ts
import { bundle } from "@motiojs/bundler";
import { renderDistributed } from "@motiojs/distributed";
import { selectComposition } from "@motiojs/renderer";

const serveUrl = await bundle({ entryPoint: "src/index.ts" });
const composition = await selectComposition({ serveUrl, id: "Intro" });

// Four chunks rendered in parallel child processes, joined without re-encoding.
const { outputLocation, chunks, timings } = await renderDistributed({
	serveUrl,
	composition,
	codec: "h264",
	outputLocation: "out/intro.mp4",
	chunks: 4,
	onProgress: ({ stage, progress }) => console.log(stage, Math.round(progress * 100)),
});
console.log(outputLocation, chunks.length, timings.renderMs, timings.assembleMs);
```

`renderDistributed()` takes the options of a single-node render (codec, quality, image and audio options, `frameRange`) plus exactly one of `chunks` and `framesPerChunk`, `concurrency` (chunks rendering at once, default half the CPU threads, at most 8), `concurrencyPerChunk` (pages per chunk, default 1) and `worker`. Options are validated before any chunk renders.

- **Workers.** The default `LocalChunkWorker` renders each chunk in its own Node child process. A `ChunkJob` is plain JSON, so another `ChunkWorker` can render chunks elsewhere by running the renderer's `renderChunk()` where the bundle is reachable; none ships with the package.
- **Containers.** Chunks are MPEG-TS for H.264 and H.265, WebM for VP8, VP9 and AV1, MOV for ProRes. Every worker of an AV1 render needs the same AV1 encoder. GIF, audio-only codecs and `everyNthFrame` cannot be rendered in chunks.
- **Building blocks.** `planChunks()` and `assembleChunks()` are exported for custom pipelines.

## Compatibility

There is no Remotion package of the same name: Motio offers this package as its alternative to `@remotion/lambda` and `@remotion/cloudrun`, rendering on your own machines. No cloud adapter is implemented yet.

Documentation: [motio.esse.dev/reference/packages/distributed](https://motio.esse.dev/reference/packages/distributed/) · Guide: [Rendering from Node](https://motio.esse.dev/guide/rendering-node/), [Rendering from the CLI](https://motio.esse.dev/guide/rendering-cli/) · Source: [packages/distributed](https://github.com/essedev/motio/tree/main/packages/distributed)
