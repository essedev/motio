# @motiojs/gif

GIFs that play in step with a [Motio](../../README.md) video. A GIF in a plain `<img>` animates on the browser's own clock, so each render catches it at a different moment; `<Gif>` decodes the file in JavaScript and draws, on every video frame, the GIF frame on screen at that moment.

```bash
pnpm add @motiojs/gif
```

<!-- example: ../../docs/guide/examples/src/packages/gif.tsx#gif -->
```tsx
import { Gif } from "@motiojs/gif";
import { AbsoluteFill, staticFile } from "@motiojs/motio";

export const Reaction = () => (
	<AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
		{/* public/reaction.gif, fitted into 480x480; it starts one second in (at 30 fps), plays
		    at half speed and stays on its last frame. */}
		<Gif
			src={staticFile("reaction.gif")}
			width={480}
			height={480}
			fit="contain"
			from={30}
			playbackRate={0.5}
			loopBehavior="pause-after-finish"
		/>
	</AbsoluteFill>
);
```

The GIF is drawn on a `<canvas>` (the ref). Each GIF frame is shown from the sum of the delays before it until the next one starts; a delay of 0 counts as 100 ms, as browsers do. The render waits until the file is downloaded and decoded.

| Prop | Default | |
|---|---|---|
| `src` | | A `staticFile()` path or a URL; from another origin the server must allow CORS. |
| `width`, `height` | the canvas's laid-out size | Size of the canvas in pixels. |
| `fit` | `"fill"` | `"fill"` stretches, `"contain"` fits inside, `"cover"` fills and crops. |
| `playbackRate` | 1 | 2 plays twice as fast. |
| `loopBehavior` | `"loop"` | `"pause-after-finish"` holds the last frame, `"unmount-after-finish"` removes the canvas. |
| `from`, `durationInFrames`, `trimBefore`, `premountFor`, `hidden` | | Timing, as on a `<Sequence>`. |
| `onLoad`, `onError` | | `onLoad` receives the size, the delays and the decoded frames. With `onError`, a file that cannot be loaded draws nothing instead of failing the render. |
| `cropLeft`, `cropRight`, `cropTop`, `cropBottom` | | Ratios from 0 to 1 that cut the canvas. |
| `requestInit` | | Passed to `fetch()`: headers, credentials. |
| `delayRenderTimeoutInMilliseconds` | 30 s | How long the render waits for the file. |

## A video as long as a GIF

<!-- example: ../../docs/guide/examples/src/packages/gif.tsx#duration -->
```tsx
import { Gif, getGifDurationInSeconds } from "@motiojs/gif";
import { type CalculateMetadataFunction, Composition, staticFile } from "@motiojs/motio";

const FPS = 30;

// A video exactly as long as one play of the GIF.
const calculateMetadata: CalculateMetadataFunction<{ src: string }> = async ({ props }) => ({
	durationInFrames: Math.ceil((await getGifDurationInSeconds(staticFile(props.src))) * FPS),
});

const Sticker = ({ src }: { src: string }) => (
	<Gif src={staticFile(src)} width={512} height={512} fit="cover" />
);

export const StickerRoot = () => (
	<Composition
		id="Sticker"
		component={Sticker}
		width={512}
		height={512}
		fps={FPS}
		durationInFrames={FPS}
		defaultProps={{ src: "sticker.gif" }}
		calculateMetadata={calculateMetadata}
	/>
);
```

`getGifDurationInSeconds(src)` downloads the file and returns one play's length (looping not counted).

## Preloading for the Player

<!-- example: ../../docs/guide/examples/src/packages/gif.tsx#preload -->
```tsx
import { preloadGif } from "@motiojs/gif";
import { useEffect } from "react";

// In an app that embeds the Player: decode the GIF before the scene that shows it mounts.
export const usePreloadedGif = (src: string) => {
	useEffect(() => {
		const { waitUntilDone, free } = preloadGif(src);
		waitUntilDone().catch((error: unknown) => console.warn(`Could not preload ${src}`, error));
		return free;
	}, [src]);
};
```

A render needs no preloading. In the Player, `preloadGif(src)` downloads and decodes the file before a `<Gif>` with the same `src` mounts, which then shows it at once; `free()` cancels the preload, or releases the frames once no `<Gif>` shows them.

## Gif or AnimatedImage

`<AnimatedImage>` from `@motiojs/motio` does the same for GIF, APNG, WebP and AVIF with the browser's own decoder (`ImageDecoder`), which Safari lacks. `<Gif>` reads GIF files only and works in every browser. In renders both give the same frame for the same time.

## Compatibility

The compat alias maps `@remotion/gif` here. The `effects` prop is not supported and must be empty or absent.
