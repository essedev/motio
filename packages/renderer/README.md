# @motiojs/renderer

The Node renderer of [Motio](../../README.md): it opens a bundle in a pinned headless Chrome, captures it frame by frame and encodes with FFmpeg (`renderMedia`, `renderStill`, `renderFrames`, `stitchFramesToVideo`, `getCompositions`, `selectComposition`). This page covers the media functions and the reusable browser; the architecture is in [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md).

## Media functions

Three functions read local media files with the FFmpeg and ffprobe the renderer resolves (the `ffmpegExecutable` and `ffprobeExecutable` options, `MOTIO_FFMPEG` and `MOTIO_FFPROBE`, `@motiojs/ffmpeg` when installed, then `PATH`); `binariesDirectory` points at a folder holding both instead. Paths may be relative to the working directory; URLs are refused, so download remote files first.

### `getVideoMetadata(path, options?)`

<!-- example: ../../docs/guide/examples/src/packages/renderer.ts#metadata -->
```ts
import { getVideoMetadata } from "@motiojs/renderer";

const meta = await getVideoMetadata("assets/interview.mp4");
// {
//   fps: 29.97003, width: 1920, height: 1080, durationInSeconds: 61.2,
//   codec: "h264", canPlayInVideoTag: true, supportsSeeking: true,
//   colorSpace: "bt709", pixelFormat: "yuv420p",
//   audioCodec: "aac", audioFileExtension: "aac",
//   rotation: 0,
// }
const durationInFrames = Math.ceil(meta.durationInSeconds * 30);
```

- `width` and `height` are the stored size. `rotation` (a Motio addition) is the clockwise rotation a player applies to show the video upright, from the file's display matrix: phone videos often store landscape pixels with `rotation: 90`, and their displayed size is `height` by `width`.
- `supportsSeeking` predicts whether the video seeks well in a browser: false for ProRes and unknown codecs, and for H.264 files of 5 seconds or more unless they are MP4 or MOV with the `moov` atom first. Fix such a file with `ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4`.
- An untagged video reports `colorSpace: "bt601"`. `audioCodec` is null without audio.
- Audio-only files fail with `E_NO_VIDEO_STREAM`, missing files with `E_MEDIA_SOURCE`.

### `extractAudio({ videoSource, audioOutput })`

Copies the first audio stream into a file without re-encoding it. The extension of `audioOutput` chooses the container, so it must be one that holds the codec: `getVideoMetadata().audioFileExtension` names one (`aac`, `mp3`, `opus`, `wav`). `.m4a` and `.mka` also work for AAC. A wrong extension fails with `E_FFMPEG_FAILED` and a message naming the right one; a file without audio fails with `E_NO_AUDIO_STREAM`. The output's folder is created, an existing file is replaced, and a failed extraction leaves no partial file.

<!-- example: ../../docs/guide/examples/src/packages/renderer.ts#extract-audio -->
```ts
import { extractAudio, getVideoMetadata } from "@motiojs/renderer";

const { audioFileExtension } = await getVideoMetadata("clip.mp4");
if (audioFileExtension) {
	await extractAudio({ videoSource: "clip.mp4", audioOutput: `out/clip.${audioFileExtension}` });
}
```

### `getSilentParts({ src, noiseThresholdInDecibels?, minDurationInSeconds? })`

Finds the silent and audible parts of a video or audio file with FFmpeg's `silencedetect`. Audio quieter than `noiseThresholdInDecibels` (default -20 dB relative to full scale, must be below 30) for at least `minDurationInSeconds` (default 1, must be above 0) is silent. Parts are in seconds, in order, and `audibleParts` covers the rest of the file.

<!-- example: ../../docs/guide/examples/src/packages/renderer.ts#silent-parts -->
```ts
import { getSilentParts } from "@motiojs/renderer";

const { silentParts, audibleParts, durationInSeconds } = await getSilentParts({
	src: "podcast.wav",
	noiseThresholdInDecibels: -35,
	minDurationInSeconds: 0.5,
});
// Keep only what is spoken, for example as <Sequence>s of an <OffthreadVideo>:
const cuts = audibleParts.map((p) => [p.startInSeconds, p.endInSeconds]);
```

A silence that lasts to the end of the audio ends at `durationInSeconds`, the container's duration.

### Compared with Remotion

Recorded against `@remotion/renderer@4.0.545` on the files in [`fixtures/node-api`](../../fixtures/node-api) (`pnpm --dir tools/oracle-render record:node-api`): `getVideoMetadata` returns the same value for every field Remotion returns, on H.264 in MP4 and MKV, H.265 10-bit, VP9 with Opus, ProRes 4444 and a rotated video; `extractAudio` writes the same decoded samples for AAC, MP3, PCM and Opus into WebM; `getSilentParts` returns the same parts and durations on AAC, Opus and PCM tracks of videos. Measured differences:

- MP3 duration: Motio reports the container's (2.000000 s for a 2 s tone), Remotion adds the encoder's padding (2.037551 s).
- Opus at 0 dB: Remotion starts the silence 0.5 ms in, after a 0.5 ms audible part; Motio finds silence from the first sample.
- Opus into `.opus`: FFmpeg's Ogg muxer keeps the stream's pre-skip, so the file decodes to 96024 samples where Remotion's decodes to 96648 (the source: 96000).
- Remotion 4.0.545 fails on PCM WAV files in `getSilentParts` and on `.m4a` output in `extractAudio`; Motio handles both.

## Reusing a browser across renders

Every render normally launches Chrome and kills it at the end. A pipeline that renders many stills or short videos can open the browser once and pass it to every call as `puppeteerInstance`:

<!-- example: ../../docs/guide/examples/src/packages/renderer.ts#browser -->
```ts
import { openBrowser, renderMedia, renderStill, selectComposition } from "@motiojs/renderer";

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
```

- Each render opens its own tabs on the shared browser and closes them when it ends; the browser processes stay until `close()`. The layout of a render does not change: its pages are spread over two browser processes by default (more above concurrency 8), and `pagesPerBrowser` still applies. The instance starts one browser at once and the others the first time a render needs them.
- Transparent captures (PNG with alpha, the `renderStill` default) composite differently from opaque ones for identical pixels, so they run on a browser of their own, also kept.
- `browserExecutable` and `chromiumOptions` are fixed when the browser starts: pass them to `openBrowser()`. A render given `puppeteerInstance` ignores its own.
- A browser that crashes is replaced on the next render. Several renders may share the instance at the same time.
- `close()` kills every process and resolves when they have exited; calling it twice throws `E_BROWSER_CLOSED` unless you pass `{ silent: true }`. A render given a closed instance fails with `E_BROWSER_CLOSED`, and a render running while the instance closes fails.
- The instance is not a Puppeteer `Browser`, and a Puppeteer `Browser` is not accepted (`E_INVALID_OPTION`).

Gain, measured on 10 calls back to back (512x288 composition, Apple M5, medians of 5 alternating rounds, `openBrowser()` included in the shared time):

| Calls | New browser each time | Shared browser | Ratio |
|---|---|---|---|
| `renderStill`, PNG | 367 ms per call | 160 ms per call | 0.44 |
| `renderStill`, JPEG | 189 ms per call | 115 ms per call | 0.61 |
| `renderMedia`, 30 frames H.264, concurrency 4 | 350 ms per call | 252 ms per call | 0.72 |
| `selectComposition` | 165 ms per call | 90 ms per call | 0.55 |

What remains per call is opening the tabs, loading the bundle and, for videos, capture and encoding.
