import { bundle, loadConfig } from "@motiojs/bundler";
import { renderMedia, selectComposition } from "@motiojs/renderer";

// region: load
// The same settings as the CLI: motio.config.ts with the MOTIO_* variables over it.
const { config, bundleOptions, sessionOptions } = await loadConfig();

const serveUrl = await bundle(bundleOptions);
const composition = await selectComposition({ ...sessionOptions, serveUrl, id: "Intro" });
await renderMedia({
	...sessionOptions,
	...config.render,
	serveUrl,
	composition,
	codec: config.render?.codec ?? "h264",
	outputLocation: "out/intro.mp4",
});
// endregion
