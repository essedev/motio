# @motiojs/renderer

The Node renderer of [Motio](../../README.md): it opens a bundle in a pinned headless Chrome, captures it frame by frame and encodes with FFmpeg (`renderMedia`, `renderStill`, `renderFrames`, `stitchFramesToVideo`, `getCompositions`, `selectComposition`). This page covers the media functions; the architecture is in [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md).

## Media functions

Three functions read local media files with the FFmpeg and ffprobe the renderer resolves (the `ffmpegExecutable` and `ffprobeExecutable` options, `MOTIO_FFMPEG` and `MOTIO_FFPROBE`, `@motiojs/ffmpeg` when installed, then `PATH`); `binariesDirectory` points at a folder holding both instead. Paths may be relative to the working directory; URLs are refused, so download remote files first.

### `getVideoMetadata(path, options?)`

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

```ts
import { extractAudio, getVideoMetadata } from "@motiojs/renderer";

const { audioFileExtension } = await getVideoMetadata("clip.mp4");
if (audioFileExtension) {
	await extractAudio({ videoSource: "clip.mp4", audioOutput: `out/clip.${audioFileExtension}` });
}
```

### `getSilentParts({ src, noiseThresholdInDecibels?, minDurationInSeconds? })`

Finds the silent and audible parts of a video or audio file with FFmpeg's `silencedetect`. Audio quieter than `noiseThresholdInDecibels` (default -20 dB relative to full scale, must be below 30) for at least `minDurationInSeconds` (default 1, must be above 0) is silent. Parts are in seconds, in order, and `audibleParts` covers the rest of the file.

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
