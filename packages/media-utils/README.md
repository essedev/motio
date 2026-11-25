# @motiojs/media-utils

Audio data and media metadata in the browser, for videos that react to sound in [Motio](https://motio.esse.dev): load the samples of an audio file, draw its spectrum or waveform at the current frame, and read the duration and size of audio, video and image files.

```bash
pnpm add @motiojs/media-utils
```

<!-- example: ../../docs/guide/examples/src/packages/media-utils.tsx#spectrum -->
```tsx
import { useAudioData, visualizeAudio } from "@motiojs/media-utils";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from "@motiojs/motio";

export const Spectrum = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const src = staticFile("music.mp3");
	// null until the file is decoded; the render waits for it.
	const audioData = useAudioData(src);
	if (!audioData) return null;
	// 32 frequency bands at this frame, low frequencies first.
	const bands = visualizeAudio({ audioData, frame, fps, numberOfSamples: 32 });
	return (
		<AbsoluteFill style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, padding: 40 }}>
			<Audio src={src} />
			{bands.map((value, band) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: bands keep their order on every frame.
					key={band}
					style={{ flex: 1, height: `${Math.min(1, value) * 100}%`, background: "#ffb000" }}
				/>
			))}
		</AbsoluteFill>
	);
};
```

| Export | What it does |
|---|---|
| `useAudioData(src, options?)` | Loads the file with `getAudioData()`; returns null until it is loaded. The render waits for it and fails if the file cannot be loaded. |
| `useWindowedAudioData(options)` | Loads only the audio around the current frame (three windows of `windowInSeconds`), so long files never sit in memory whole. |
| `getAudioData(src, options?)` | Decodes a file with the browser (48000 Hz by default) into channel data, cached by `src` and sample rate. |
| `visualizeAudio(options)` | The frequency spectrum at a frame, as `numberOfSamples` values, low frequencies first. |
| `visualizeAudioWaveform(options)` | The waveform around the current time as values in -1..1, suited to voice. |
| `getWaveformPortion(options)` | A time range of the waveform compressed into bars. |
| `createSmoothSvgPath({ points })` | A smooth SVG path through points, for drawing a waveform. |
| `audioBufferToDataUrl(buffer)` | An `AudioBuffer` as a WAV data URL. |
| `getAudioDurationInSeconds(src)`, `getImageDimensions(src)` | Duration of an audio file and size of an image, read by the browser. |
| `getVideoMetadata(src)` | Duration, dimensions and aspect ratio of a video the browser can open. Deprecated, kept for compatibility. |

## Compatibility

The compat alias maps `@remotion/media-utils` here. Every function matches the published package exactly or within 1e-12 in the same browser, except `useWindowedAudioData`: Remotion repeats one sample at each window boundary while Motio's windows tile the file exactly, so on windowed data `visualizeAudio` differs by up to 0.042 and `visualizeAudioWaveform` by up to 0.0028. `getImageDimensions` rejects with an `Error` (the browser's event as `cause`) instead of the bare event. Details in [COMPAT.md](https://github.com/essedev/motio/blob/main/packages/media-utils/COMPAT.md).

Documentation: [motio.esse.dev/reference/packages/media-utils](https://motio.esse.dev/reference/packages/media-utils/) · Source: [packages/media-utils](https://github.com/essedev/motio/tree/main/packages/media-utils)
