# Media

Images, videos and audio files go in `public/` and are referenced with `staticFile()`; remote `https://` URLs work too. Every media component makes the render wait until the frame it shows is ready, so a frame is never captured half-loaded.

## Images

`<Img>` is an `<img>` that holds the frame until the image has loaded and decoded:

<!-- example: examples/src/media.tsx#img -->
```tsx
import { AbsoluteFill, Img, staticFile } from "@motiojs/motio";

export const Cover = () => (
	<AbsoluteFill>
		{/* public/cover.jpg; the frame is captured only once the image has loaded. */}
		<Img
			src={staticFile("cover.jpg")}
			style={{ width: "100%", height: "100%", objectFit: "cover" }}
		/>
	</AbsoluteFill>
);
```

A plain `<img>` or a CSS `background-image` also works: Motio waits for the images a page requests before each screenshot. `<Img>` adds retries (`maxRetries`, default 2) and then fails the render with the file name, instead of capturing an empty box.

### Animated images

A GIF or WebP in a plain `<img>` animates on the browser's own clock, so each render catches it at a different moment. `<AnimatedImage>` ties an animated GIF, APNG, WebP or AVIF file to the video's frames:

<!-- example: examples/src/media.tsx#animated-image -->
```tsx
import { AbsoluteFill, AnimatedImage, staticFile } from "@motiojs/motio";

export const Sticker = () => (
	<AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
		{/* public/sticker.webp on a 300x300 canvas, letterboxed if it is not square. It appears
		    one second in (at 30 fps), plays at half speed and stays on its last frame. */}
		<AnimatedImage
			src={staticFile("sticker.webp")}
			width={300}
			height={300}
			fit="contain"
			from={30}
			playbackRate={0.5}
			loopBehavior="pause-after-finish"
		/>
	</AbsoluteFill>
);
```

For every video frame it draws on a canvas the image frame on screen at that moment: each image frame is shown from the sum of the durations before it until the next one starts, and a frame with a duration of 0 lasts 100 ms, as in a browser. The render waits until that frame is decoded.

- Without `width` and `height` the canvas takes the image's own size; `fit` (`"fill"`, `"contain"`, `"cover"`) places the image in it.
- `loopBehavior` is `"loop"` (the default), `"pause-after-finish"` or `"clear-after-finish"`.
- The `<Sequence>` timing props (`from`, `durationInFrames`, `trimBefore`, `freeze`, ...) and the crop props work as on a sequence; `ref` gives the `<canvas>`.
- A file that cannot be loaded or decoded fails the render with its name. Pass `onError` to carry on without the image.

Decoding uses the browser's `ImageDecoder`, which the renderer's Chrome has, as do Chrome and Firefox in the Player; Safari does not. `<Gif>` from `@motiojs/gif` decodes GIF files in JavaScript and works everywhere.

## Video

<!-- example: examples/src/media.tsx#video -->
```tsx
import { Video as CanvasVideo } from "@motiojs/media";
import { AbsoluteFill, OffthreadVideo, staticFile, Video } from "@motiojs/motio";

export const Clip = () => (
	<AbsoluteFill>
		{/* The exact source frame for every video frame, extracted by FFmpeg. Skips the first
		    2 seconds of the file (at 30 fps) and plays at 1.5x. */}
		<OffthreadVideo src={staticFile("clip.mp4")} trimBefore={60} playbackRate={1.5} />
	</AbsoluteFill>
);

// A native <video> element, for refs and canvas drawing; seeked for every frame when rendering.
export const NativeClip = () => <Video src={staticFile("clip.mp4")} muted />;

// The @motiojs/media component, drawn into a <canvas>.
export const CanvasClip = () => <CanvasVideo src={staticFile("clip.mp4")} />;
```

Motio has three video components. `<Video>` from `@motiojs/motio` and `Video` from `@motiojs/media` are different components with the same name, which is why the example imports the second one as `CanvasVideo`:

| Component | Import | In a render | Choose it when |
|---|---|---|---|
| `<OffthreadVideo>` | `@motiojs/motio` | FFmpeg extracts the exact source frame, shown as an image. | By default: any codec FFmpeg reads (ProRes, HEVC), any frame rate, transparency with `transparent`. |
| `<Video>` | `@motiojs/motio` | A real `<video>` element, seeked to each frame. | You need the element: a ref, drawing it into a canvas, CSS on the element. The file must play in Chrome. |
| `Video` | `@motiojs/media` | The exact source frame, drawn into a `<canvas>`. | You process frames (`onVideoFrame`, `headless`) or want a canvas, with `objectFit`. |

In the preview and the Player all three play a normal `<video>` on the real clock. The [`@motiojs/media` README](../../packages/media/README.md) has the props of each.

All of them take `trimBefore` and `trimAfter` (in frames of the composition) to play part of the file, `playbackRate`, `volume` and `muted`; `<Video>` and the `@motiojs/media` `Video` also take `loop`. A video placed in a `<Sequence>` starts playing when the sequence starts.

## Audio

`<Audio>` plays a sound file. Its `volume` is a number, or a function of the frames since the audio started, for fades:

<!-- example: examples/src/media.tsx#audio -->
```tsx
import { Audio, interpolate, Sequence, staticFile } from "@motiojs/motio";

export const Soundtrack = () => (
	<>
		{/* Fades in over the first second; the function gets the frame since the audio started. */}
		<Audio
			src={staticFile("music.mp3")}
			volume={(f) => interpolate(f, [0, 30], [0, 0.8], { extrapolateRight: "clamp" })}
		/>
		{/* A sound effect at frame 90. */}
		<Sequence from={90}>
			<Audio src={staticFile("whoosh.wav")} />
		</Sequence>
	</>
);
```

Audio is never recorded from the browser. Each media component reports what it plays on every frame (the file, the position, the volume, the speed), and Motio mixes the sounds in Node, sample-accurately, and encodes the mix once. Videos contribute their soundtrack the same way unless `muted`. `--muted` renders without sound; rendering to `.mp3`, `.aac` or `.wav` writes only the audio.

`toneFrequency` changes the pitch (0.01 to 2) and `audioStreamIndex` picks a track of a file with several; both apply to renders only.

## Preloading for the player

A render never needs preloading: it waits for every file before capturing a frame. The Player, which embeds a composition in your own React app, plays on real time instead, so a video that mounts in the middle of playback (in a `<Sequence>` that starts later, say) makes it stand still while the browser downloads the file. `@motiojs/preload` starts those downloads early:

<!-- example: examples/src/preload.tsx#preload -->
```tsx
import { AbsoluteFill, Audio, OffthreadVideo, Sequence } from "@motiojs/motio";
import { Player } from "@motiojs/player";
import { preloadAudio, preloadVideo } from "@motiojs/preload";
import { useEffect, useState } from "react";

const TRAILER = "https://cdn.example.com/trailer.mp4";
const MUSIC = "https://cdn.example.com/music.mp3";

// The trailer starts 5 seconds in (at 30 fps). Without preloading, the browser starts fetching
// it only when the sequence mounts, and the player stands still until enough has arrived.
const Promo = () => (
	<AbsoluteFill style={{ backgroundColor: "black" }}>
		<Audio src={MUSIC} />
		<Sequence from={150}>
			<OffthreadVideo src={TRAILER} />
		</Sequence>
	</AbsoluteFill>
);

// The page of your app that embeds the player.
export const PromoPage = () => {
	const [trailerReady, setTrailerReady] = useState(false);
	useEffect(() => {
		// Both downloads start when the page mounts. Each call returns a function that frees it.
		const frees = [
			preloadVideo(TRAILER, { onReady: () => setTrailerReady(true) }),
			preloadAudio(MUSIC),
		];
		return () => {
			for (const free of frees) free();
		};
	}, []);
	return (
		<>
			<Player
				component={Promo}
				durationInFrames={450}
				fps={30}
				compositionWidth={1920}
				compositionHeight={1080}
				controls
				style={{ width: "100%" }}
			/>
			{trailerReady ? null : <p>Loading the trailer...</p>}
		</>
	);
};
```

Chrome shares the data it has buffered for a file with every media element of the page that plays the same URL, so the `<OffthreadVideo>` that mounts at second 5 starts at once and the file is downloaded only once. In a measurement with a server that took 3 s to send the file, the Player stood still for 3.1 s without preloading and never more than 50 ms with it.

| Function | Adds to the page |
|---|---|
| `preloadVideo(src, options?)` | A hidden, muted `<video preload="auto">`. |
| `preloadAudio(src, options?)` | A hidden `<audio preload="auto">`. |
| `preloadImage(src, options?)` | `<link rel="preload" as="image">`. |
| `preloadFont(src, options?)` | `<link rel="preload" as="font" crossorigin="anonymous">`, which an `@font-face` rule for the same URL reuses. |
| `resolveRedirect(src)` | Nothing: it resolves with the URL after every redirect, without downloading the body. |

- Every preload function returns a function that stops the preload. Calls for the same URL share one element, removed when the last of them is freed.
- `onReady()` is called once the browser holds enough to show the asset (a video or sound that can play to the end without waiting, an image or font fully loaded), at once if it already does. `onError(error)` is called when the file cannot be loaded; without it, a warning is logged.
- Call them in an effect or at module level. Outside a browser (server-side rendering) they log a warning and do nothing.
- `premountFor` on a `<Sequence>` is the other way to have a video ready before it plays; preloading also works before any Player exists and across several Players.
