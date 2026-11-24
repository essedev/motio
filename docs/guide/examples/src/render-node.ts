import { bundle } from "@motiojs/bundler";
import {
	isMotioError,
	renderMedia,
	renderStill,
	type SourceLocation,
	selectComposition,
} from "@motiojs/renderer";

// region: render
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
// endregion

// region: diagnostics
const result = await renderMedia({
	serveUrl,
	composition,
	inputProps,
	codec: "h264",
	outputLocation: "out/intro.mp4",
	// Every 5 seconds for each delayRender() handle the render is waiting on.
	onDelayRenderPending: ({ label, frame, elapsedMs, timeoutMs }) =>
		console.log(
			`Waiting on ${label ?? "delayRender()"} at frame ${frame}: ${elapsedMs}/${timeoutMs} ms`,
		),
});
// Each warning once, with the first frame it was seen on.
for (const { code, message, frame } of result.warnings) {
	console.warn(`${code}: ${message}${frame === undefined ? "" : ` (frame ${frame})`}`);
}

try {
	await renderStill({ serveUrl, composition, inputProps, frame: 30, output: "out/frame-30.png" });
} catch (error) {
	if (isMotioError(error, "E_ASSET_NOT_FOUND")) {
		// details.path is the file in public/, details.suggestion the closest existing name.
		console.error(`Missing public/${error.details?.path}, closest: ${error.details?.suggestion}`);
	} else if (isMotioError(error)) {
		// Where in the project's code a page error was thrown, mapped through the source maps.
		const source = error.details?.source as SourceLocation | undefined;
		const at = source ? ` in ${source.file}:${source.line}:${source.column}` : "";
		console.error(`${error.code} at frame ${error.frame}${at}: ${error.message}`);
	}
	throw error;
}
// endregion
