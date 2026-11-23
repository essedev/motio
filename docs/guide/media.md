# Media

Images, videos and audio files go in `public/` and are referenced with `staticFile()`; remote `https://` URLs work too. Every media component makes the render wait until the frame it shows is ready, so a frame is never captured half-loaded.

## Images

`<Img>` is an `<img>` that holds the frame until the image has loaded and decoded:

<!-- example: examples/src/media.tsx#img -->
```tsx
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

- `<OffthreadVideo>` is the default choice for renders: for each frame, Motio picks the exact source frame from the file's timestamps, extracts it with FFmpeg and shows it as an image. It handles any frame rate and codec FFmpeg reads. In the preview it plays a normal `<video>`.
- `<Video>` keeps a real `<video>` element, seeked to each frame. Use it when you need the element: a ref, drawing it into a canvas, CSS on the element itself.
- `Video` from `@motiojs/media` draws the extracted frames into a `<canvas>`.

All of them take `trimBefore` and `trimAfter` (in frames of the composition) to play part of the file, `playbackRate`, `volume` and `muted`; `<Video>` and the `@motiojs/media` `Video` also take `loop`. A video placed in a `<Sequence>` starts playing when the sequence starts.

## Audio

`<Audio>` plays a sound file. Its `volume` is a number, or a function of the frames since the audio started, for fades:

<!-- example: examples/src/media.tsx#audio -->
```tsx
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

> **Coming in M6: `@motiojs/preload`.** Functions to load videos, audio, images and fonts ahead of time, so the preview and an embedded player play without waiting for the network.
