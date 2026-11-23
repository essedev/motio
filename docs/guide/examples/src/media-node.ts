import { bundle } from "@motiojs/bundler";
import {
	extractAudio,
	getSilentParts,
	getVideoMetadata,
	renderMedia,
	selectComposition,
} from "@motiojs/renderer";

// region: metadata
const meta = await getVideoMetadata("public/interview.mp4");
console.log(`${meta.width}x${meta.height}, ${meta.fps} fps, ${meta.durationInSeconds} s`);
console.log(`video ${meta.codec}, audio ${meta.audioCodec ?? "none"}`);

// A phone video is often stored sideways with a rotation to show it upright.
const sideways = meta.rotation === 90 || meta.rotation === 270;
const shown = sideways ? `${meta.height}x${meta.width}` : `${meta.width}x${meta.height}`;
console.log(`shown at ${shown}`);
// endregion

// region: extract-audio
// The audio stream copied as is: the extension must name a container that holds its codec.
if (meta.audioFileExtension !== null) {
	await extractAudio({
		videoSource: "public/interview.mp4",
		audioOutput: `out/interview.${meta.audioFileExtension}`,
	});
}
// endregion

// region: silent-parts
// Everything quieter than -35 dB for at least half a second counts as a pause.
const { audibleParts, silentParts, durationInSeconds } = await getSilentParts({
	src: "public/interview.mp4",
	noiseThresholdInDecibels: -35,
	minDurationInSeconds: 0.5,
});
const paused = silentParts.reduce((sum, p) => sum + p.endInSeconds - p.startInSeconds, 0);
console.log(`${paused.toFixed(1)} s of ${durationInSeconds.toFixed(1)} s are pauses`);

// Render the recording without them, with the JumpCut composition below.
const serveUrl = await bundle({ entryPoint: "src/index.ts" });
const inputProps = { src: "interview.mp4", parts: audibleParts };
const composition = await selectComposition({ serveUrl, id: "JumpCut", inputProps });
await renderMedia({
	serveUrl,
	composition,
	inputProps,
	codec: "h264",
	outputLocation: "out/interview-cut.mp4",
});
// endregion
