# Rendering from Node

The CLI is a thin layer over two packages you can call yourself, for a render server, a batch job or a test: `@motiojs/bundler` builds the project and `@motiojs/renderer` renders it.

```bash
pnpm add -D @motiojs/bundler @motiojs/renderer
```

A render takes three steps:

<!-- example: examples/src/render-node.ts#render -->
```ts
import { bundle } from "@motiojs/bundler";
import { renderMedia, renderStill, selectComposition } from "@motiojs/renderer";

// 1. Build the project once; the result is a directory the renderer serves.
const serveUrl = await bundle({ entryPoint: "src/index.ts" });

// 2. Resolve the composition with the props of this render (runs calculateMetadata).
const inputProps = { title: "Rendered from Node" };
const composition = await selectComposition({ serveUrl, id: "Intro", inputProps });

// 3. Render the video, then a still.
await renderMedia({
	serveUrl,
	composition,
	inputProps,
	codec: "h264",
	outputLocation: "out/intro.mp4",
	onProgress: ({ progress }) => process.stdout.write(`\r${Math.round(progress * 100)}%`),
});
await renderStill({
	serveUrl,
	composition,
	inputProps,
	frame: 30,
	output: "out/frame-30.png",
});
```

1. `bundle()` builds the project with Vite into a directory (a temporary one unless `outDir` is set) and returns its path, the `serveUrl`. Bundle once and render many times: building takes seconds, rendering a short video can take less. Options: `entryPoint`, `rootDir` (the project root, default the working directory), `publicDir`, `outDir`, `envVariables`.
2. `selectComposition()` opens the bundle in the browser, runs `calculateMetadata()` with the input props and returns the composition with its final size, frame rate, length and props. `getCompositions()` returns all of them.
3. `renderMedia()` renders a video or an audio file, `renderStill()` one frame, `renderFrames()` an image sequence. Pass the same `inputProps` you gave `selectComposition()`.

## Options

`renderMedia()` takes the options of the CLI flags in camelCase: `codec`, `crf`, `frameRange`, `everyNthFrame`, `concurrency`, `scale`, `imageFormat`, `jpegQuality`, `pixelFormat`, `proResProfile`, `muted`, `audioCodec`, `audioBitrate`, `timeoutInMilliseconds`. Every function also takes:

- `onProgress`: `renderMedia()` reports `renderedFrames`, `encodedFrames` and `progress` from 0 to 1.
- `cancelSignal`: from `makeCancelSignal()`; calling its `cancel()` stops the render and rejects the promise.
- `onBrowserLog`: the page's console output, with its location.
- `outputLocation` (`output` for `renderStill()`): leave it out to get the file as a `Buffer` in the result.
- `browserExecutable`, `ffmpegExecutable`: use another Chrome or FFmpeg.

Errors are `MotioError` instances with a stable `code` (`isMotioError()` tells them apart) and context such as the frame and the composition.

`bundle()` does not read a `remotion.config.ts` file, unlike the CLI: pass the values as options.

## Media functions

> **Coming in M6: Node media functions.** `getVideoMetadata()` (duration, size, frame rate, codec of a file), `extractAudio()`, `getSilentParts()` (silence detection, for cutting pauses out of recordings) and `openBrowser()` (one browser reused across many renders).
