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

`@motiojs/renderer` also reads and cuts media files, with the same FFmpeg and ffprobe the renders use (see [FFmpeg](ffmpeg.md)). They work on local files; relative paths are resolved against the working directory.

`getVideoMetadata()` reads a video's frame rate, size, duration, codecs, colour space and pixel format:

<!-- example: examples/src/media-node.ts#metadata -->
```ts
const meta = await getVideoMetadata("public/interview.mp4");
console.log(`${meta.width}x${meta.height}, ${meta.fps} fps, ${meta.durationInSeconds} s`);
console.log(`video ${meta.codec}, audio ${meta.audioCodec ?? "none"}`);

// A phone video is often stored sideways with a rotation to show it upright.
const sideways = meta.rotation === 90 || meta.rotation === 270;
const shown = sideways ? `${meta.height}x${meta.width}` : `${meta.width}x${meta.height}`;
console.log(`shown at ${shown}`);
```

- `width` and `height` are the size the pixels are stored at. `rotation` (0, 90, 180 or 270) is the clockwise turn a player applies to show the video upright, so a phone video with `rotation: 90` is shown `height` wide.
- `fps` is rounded to 5 decimals (29.97003 for NTSC). A video without a colour tag reports `colorSpace: "bt601"`.
- `supportsSeeking` says whether a browser seeks the file well: false for ProRes, and for H.264 of 5 seconds or more unless it is an MP4 or MOV with its index at the start. `ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4` fixes such a file.
- A file without a video stream fails with `E_NO_VIDEO_STREAM`, a missing file with `E_MEDIA_SOURCE`.

`extractAudio()` copies the first audio stream into a file without re-encoding it:

<!-- example: examples/src/media-node.ts#extract-audio -->
```ts
// The audio stream copied as is: the extension must name a container that holds its codec.
if (meta.audioFileExtension !== null) {
	await extractAudio({
		videoSource: "public/interview.mp4",
		audioOutput: `out/interview.${meta.audioFileExtension}`,
	});
}
```

Since nothing is converted, the output's extension must name a container that holds the codec: `audioFileExtension` from `getVideoMetadata()` gives one (`aac`, `mp3`, `opus`, `wav`), and `.m4a` also takes AAC. Another extension fails with `E_FFMPEG_FAILED` and a message naming the right one; a file without audio fails with `E_NO_AUDIO_STREAM`. A failed extraction leaves no partial file.

`getSilentParts()` finds the pauses in a recording with FFmpeg's `silencedetect` filter. Together with a composition that plays only the audible parts, it removes them:

<!-- example: examples/src/media-node.ts#silent-parts -->
```ts
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
```

<!-- example: examples/src/jump-cut.tsx#jump-cut -->
```tsx
/** A stretch of the recording to keep, in seconds: what getSilentParts() returns. */
type Part = { startInSeconds: number; endInSeconds: number };
type JumpCutProps = { src: string; parts: Part[] };

const FPS = 30;
const toFrames = (part: Part) => ({
	trimBefore: Math.round(part.startInSeconds * FPS),
	trimAfter: Math.round(part.endInSeconds * FPS),
});

// The kept parts back to back, each playing its stretch of the file.
const JumpCut = ({ src, parts }: JumpCutProps) => (
	<Series>
		{parts.map((part) => {
			const { trimBefore, trimAfter } = toFrames(part);
			return (
				<Series.Sequence key={trimBefore} durationInFrames={trimAfter - trimBefore}>
					<OffthreadVideo src={staticFile(src)} trimBefore={trimBefore} trimAfter={trimAfter} />
				</Series.Sequence>
			);
		})}
	</Series>
);

// The video lasts as long as the parts together.
const calculateMetadata: CalculateMetadataFunction<JumpCutProps> = ({ props }) => ({
	durationInFrames: Math.max(
		1,
		props.parts.reduce((sum, part) => {
			const { trimBefore, trimAfter } = toFrames(part);
			return sum + trimAfter - trimBefore;
		}, 0),
	),
});

export const JumpCutRoot = () => (
	<Composition
		id="JumpCut"
		component={JumpCut}
		width={1280}
		height={720}
		fps={FPS}
		durationInFrames={1}
		defaultProps={{ src: "interview.mp4", parts: [] }}
		calculateMetadata={calculateMetadata}
	/>
);
```

Audio below `noiseThresholdInDecibels` (default -20, relative to full scale) for at least `minDurationInSeconds` (default 1) is silent. `silentParts` and `audibleParts` are in seconds and in order, and together cover the whole file; a pause that lasts to the end ends at `durationInSeconds`.

## One browser for many renders

Each call normally launches Chrome and closes it at the end. A job that renders many stills or short videos can open the browser once with `openBrowser()` and pass it to every call as `puppeteerInstance`:

<!-- example: examples/src/open-browser.ts#open-browser -->
```ts
const serveUrl = await bundle({ entryPoint: "src/index.ts" });
const episodes = [
	{ slug: "episode-1", title: "Episode 1", subtitle: "Getting started" },
	{ slug: "episode-2", title: "Episode 2", subtitle: "Animation" },
	{ slug: "episode-3", title: "Episode 3", subtitle: "Rendering" },
];

// One Chrome for every render; each render opens and closes only its own tabs.
const browser = await openBrowser("chrome");
try {
	for (const { slug, ...inputProps } of episodes) {
		const composition = await selectComposition({
			serveUrl,
			id: "Thumbnail",
			inputProps,
			puppeteerInstance: browser,
		});
		await renderStill({
			serveUrl,
			composition,
			inputProps,
			output: `out/${slug}.png`,
			puppeteerInstance: browser,
		});
	}
} finally {
	await browser.close();
}
```

- Each render opens tabs on the shared browser and closes them when it ends; the browser stays until `close()`. Several renders can use it at the same time, and a browser that crashes is replaced on the next render.
- `browserExecutable` and `chromiumOptions` are fixed when the browser starts: pass them to `openBrowser()`. A render given `puppeteerInstance` ignores its own.
- After `close()`, a render given the handle fails with `E_BROWSER_CLOSED`, and so does a second `close()` unless you pass `{ silent: true }`.

`selectComposition()`, `getCompositions()`, `renderStill()`, `renderMedia()` and `renderFrames()` all take it. Measured on ten calls in a row at 512x288, a shared browser takes 0.44 of the time per PNG still and 0.72 per short video: what is left per call is opening tabs, loading the bundle and, for videos, capturing and encoding.
