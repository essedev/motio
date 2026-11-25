import { bundle } from "@motiojs/bundler";
import { renderDistributed } from "@motiojs/distributed";
import { selectComposition } from "@motiojs/renderer";

// region: render
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
// endregion
