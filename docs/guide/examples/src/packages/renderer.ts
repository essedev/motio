import {
	extractAudio,
	getSilentParts,
	getVideoMetadata,
	isMotioError,
	openBrowser,
	renderMedia,
	renderStill,
	selectComposition,
} from "@motiojs/renderer";

// region: metadata
const meta = await getVideoMetadata("assets/interview.mp4");
// {
//   fps: 29.97003, width: 1920, height: 1080, durationInSeconds: 61.2,
//   codec: "h264", canPlayInVideoTag: true, supportsSeeking: true,
//   colorSpace: "bt709", pixelFormat: "yuv420p",
//   audioCodec: "aac", audioFileExtension: "aac",
//   rotation: 0,
// }
const durationInFrames = Math.ceil(meta.durationInSeconds * 30);
// endregion

// region: extract-audio
const { audioFileExtension } = await getVideoMetadata("clip.mp4");
if (audioFileExtension) {
	await extractAudio({ videoSource: "clip.mp4", audioOutput: `out/clip.${audioFileExtension}` });
}
// endregion

// region: silent-parts
const { silentParts, audibleParts, durationInSeconds } = await getSilentParts({
	src: "podcast.wav",
	noiseThresholdInDecibels: -35,
	minDurationInSeconds: 0.5,
});
// Keep only what is spoken, for example as <Sequence>s of an <OffthreadVideo>:
const cuts = audibleParts.map((p) => [p.startInSeconds, p.endInSeconds]);
// endregion

const serveUrl = "build";
const users = [{ id: "ada" }, { id: "grace" }];

// region: browser
const browser = await openBrowser("chrome");
try {
	for (const user of users) {
		const inputProps = { user };
		const composition = await selectComposition({
			serveUrl,
			id: "card",
			inputProps,
			puppeteerInstance: browser,
		});
		await renderStill({
			serveUrl,
			composition,
			inputProps,
			output: `out/${user.id}.png`,
			puppeteerInstance: browser,
		});
		await renderMedia({
			serveUrl,
			composition,
			inputProps,
			codec: "h264",
			outputLocation: `out/${user.id}.mp4`,
			puppeteerInstance: browser,
		});
	}
} finally {
	await browser.close();
}
// endregion

// region: diagnostics
const card = await selectComposition({ serveUrl, id: "card" });
try {
	const { warnings } = await renderMedia({
		serveUrl,
		composition: card,
		codec: "h264",
		outputLocation: "out/card.mp4",
		onDelayRenderPending: (p) => console.log(`${p.label} still open after ${p.elapsedMs} ms`),
	});
	// [{ code: "W_FONT_FALLBACK", message: 'Font "Brand" is not available; ...', frame: 0 }]
	if (warnings.length > 0) console.warn(warnings);
} catch (error) {
	if (!isMotioError(error)) throw error;
	// E_RENDER_ERROR at frame 12 { file: "/project/src/Card.tsx", line: 20, column: 9 } undefined
	console.error(error.code, "at frame", error.frame, error.details?.source, error.details?.hint);
}
// endregion

export const all = [durationInFrames, silentParts, durationInSeconds, cuts];
