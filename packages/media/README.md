# @motiojs/media

Video and audio components for [Motio](../../README.md) compositions. Each one shows, on every frame of a render, the part of the file that belongs to that frame, and makes the render wait until it is ready; in the preview and the Player they play on the real clock.

```bash
pnpm add @motiojs/media
```

`@motiojs/motio` re-exports `OffthreadVideo`, and exports `Html5Video` and `Html5Audio` under the names `Video` and `Audio`. So `Video` means the native-element component when imported from `@motiojs/motio`, and the canvas component when imported from `@motiojs/media`.

## Which video component

| Component | In a render | Use it when |
|---|---|---|
| `OffthreadVideo` | FFmpeg extracts the exact source frame; the page shows it as an image. | By default. Any codec and container FFmpeg reads (ProRes, HEVC, MKV), variable frame rates, transparency with `transparent`. |
| `Html5Video` (`Video` from `@motiojs/motio`) | A real `<video>` element, seeked to each frame. | You need the element: a ref to it, drawing it on a canvas, CSS on the element itself. The file must play in Chrome (H.264, VP8, VP9, AV1). |
| `Video` from `@motiojs/media` | FFmpeg extracts the exact source frame; it is drawn into a `<canvas>`. | You process frames (`onVideoFrame`, `headless`) or want a canvas in the page; `objectFit` places the frame. |

All three pick the source frame from the file's own timestamps, so a 24 fps clip in a 30 fps video, or a clip at `playbackRate={2}`, shows the right frames in any order. They share these props:

| Prop | |
|---|---|
| `src` | A `staticFile()` path or a URL. |
| `trimBefore` | Source frames (at the composition's frame rate) skipped at the start of the file. |
| `durationInFrames` | How much of the file to show from there (`trimAfter`, the end frame, also works). |
| `playbackRate` | Speed; 2 plays twice as fast. |
| `volume` | A number, or a function of the frames since the media started (for fades). |
| `muted`, `toneFrequency`, `audioStreamIndex` | Sound. `toneFrequency` (pitch, 0.01 to 2) and `audioStreamIndex` apply to renders only. |
| `loop` | `Html5Video` and `Video` only: repeats the shown range. For `OffthreadVideo`, wrap it in a `<Loop>`. |

Placed in a `<Sequence>`, a video starts when the sequence starts.

### OffthreadVideo

<!-- example: ../../docs/guide/examples/src/packages/media.tsx#offthread -->
```tsx
import { OffthreadVideo } from "@motiojs/media";
import { AbsoluteFill, staticFile } from "@motiojs/motio";

// The default: the exact source frame for each video frame, extracted by FFmpeg and shown as an
// image. Any codec FFmpeg reads works, ProRes and HEVC included.
export const Interview = () => (
	<AbsoluteFill>
		<OffthreadVideo
			src={staticFile("interview.mov")}
			// Skip the first 3 seconds of the file (at 30 fps) and show the next 10.
			trimBefore={90}
			durationInFrames={300}
			// Keep the alpha channel of a ProRes 4444 or VP9 file with transparency.
			transparent
			style={{ width: "100%", height: "100%", objectFit: "cover" }}
		/>
	</AbsoluteFill>
);
```

Frames are extracted in batches and cached, so following frames are cheap. `onError` makes a frame that cannot be extracted not fail the render.

### Html5Video

<!-- example: ../../docs/guide/examples/src/packages/media.tsx#html5 -->
```tsx
import { Html5Video } from "@motiojs/media";
import { AbsoluteFill, staticFile } from "@motiojs/motio";
import { useCallback, useRef } from "react";

// A real <video> element, seeked to each frame. The ref is the element, so it can be read or
// drawn like any video. The file must be one Chrome plays (H.264, VP9, AV1 in MP4 or WebM).
export const Mirrored = () => {
	const canvas = useRef<HTMLCanvasElement>(null);
	// Called with the <video> element every time it shows a new frame.
	const onVideoFrame = useCallback((frame: CanvasImageSource) => {
		const context = canvas.current?.getContext("2d");
		context?.drawImage(frame, 0, 0, 640, 360);
	}, []);
	return (
		<AbsoluteFill style={{ flexDirection: "row" }}>
			<Html5Video src={staticFile("clip.mp4")} onVideoFrame={onVideoFrame} style={{ width: 640 }} />
			<canvas ref={canvas} width={640} height={360} style={{ transform: "scaleX(-1)" }} />
		</AbsoluteFill>
	);
};
```

The element is seeked to the middle of the chosen frame and the frame waits for the browser to show it. It needs a server that answers range requests, which `motio dev` and the renderer provide; a remote URL must allow them too.

### Video (canvas)

<!-- example: ../../docs/guide/examples/src/packages/media.tsx#canvas -->
```tsx
import { Video } from "@motiojs/media";
import { staticFile } from "@motiojs/motio";

// The exact source frame, drawn into a <canvas>; `objectFit` places it in the canvas box.
export const Background = () => (
	<Video
		src={staticFile("loop.mp4")}
		loop
		muted
		objectFit="cover"
		style={{ width: "100%", height: "100%" }}
	/>
);

// With `headless`, nothing is mounted and `onVideoFrame` receives each frame to process: an
// ImageBitmap in a render, the <video> element in the preview.
export const Analysed = ({ onFrame }: { onFrame: (frame: CanvasImageSource) => void }) => (
	<Video src={staticFile("clip.mp4")} headless onVideoFrame={onFrame} />
);
```

In a render the canvas has the size of the video's frames and `objectFit` (default `"contain"`) places it in the box `style` gives. A frame that cannot be extracted fails the render, unless `fallbackOffthreadVideoProps.onError` is given: then it receives the error and the render goes on. (`OffthreadVideo` extracts frames the same way, so there is no other path to fall back to; `onError` returning `"fail"` and `disallowFallbackToOffthreadVideo` make the failure unconditional.) The crop props (`cropLeft`, `cropRight`, `cropTop`, `cropBottom`, ratios from 0 to 1) cut the frame as on a `<Sequence>`. `effects` is not supported yet and fails with a clear error.

## Audio

<!-- example: ../../docs/guide/examples/src/packages/media.tsx#audio -->
```tsx
import { Audio } from "@motiojs/media";
import { Sequence, staticFile } from "@motiojs/motio";

export const Voiceover = () => (
	<Sequence from={30}>
		{/* At 1.25x the pitch rises, as with a record played faster; preservePitch keeps it. */}
		<Audio src={staticFile("voiceover.mp3")} playbackRate={1.25} preservePitch volume={0.9} />
	</Sequence>
);
```

Audio is never recorded from the browser: each component reports on every frame what it plays (the file, the position, the volume, the speed), and the renderer mixes the sounds in Node and encodes the mix once. Videos add their soundtrack the same way unless `muted`.

| Component | Speed and pitch | |
|---|---|---|
| `Audio` from `@motiojs/media` | The pitch follows `playbackRate` unless `preservePitch`. | A native `<audio>` element in the preview, synchronised through `fallbackHtml5AudioProps`. |
| `Html5Audio` (`Audio` from `@motiojs/motio`) | The pitch is kept. | A native `<audio>` element in the preview. |

Both take `trimBefore`, `durationInFrames`, `loop`, `volume`, `muted`, `toneFrequency` and `audioStreamIndex`.

## Compatibility

The compat alias maps `@remotion/media` here (`Video`, `Audio` and their `experimental_` names); the `remotion` components (`OffthreadVideo`, `Html5Video`, `Html5Audio`, and `Video` and `Audio` as aliases of the HTML5 ones) come from `@motiojs/motio/remotion`. Against recordings of Remotion, `OffthreadVideo` and the `@motiojs/media` `Video` select the same source frames on 24, 30, 59.94 and 60 fps files, with a `playbackRate` and a trim; Remotion's own HTML5 video is not frame-exact in renders, and Motio's `Html5Video` shows the nearest frame on every frame.
