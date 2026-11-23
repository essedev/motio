# @motiojs/preload

Preload videos, audio, images and fonts so a [Motio](../../README.md) Player shows them without loading. Rendering never needs it: renders wait for every asset anyway.

```tsx
import { preloadAudio, preloadFont, preloadImage, preloadVideo } from "@motiojs/preload";
import { useEffect } from "react";

export const usePreloads = () => {
	useEffect(() => {
		const frees = [
			preloadVideo("https://example.com/intro.mp4", { onReady: () => console.log("intro buffered") }),
			preloadAudio("/music.mp3"),
			preloadImage("/logo.png"),
			preloadFont("/fonts/inter.woff2"),
		];
		return () => {
			for (const free of frees) free();
		};
	}, []);
};
```

Call a preload function outside a component or in an effect. Each returns a function that stops the preload; calls for the same URL share one element, removed when the last one is freed. Outside the browser (server-side rendering, Node) they log a warning and do nothing.

| Function | What it adds |
|---|---|
| `preloadVideo(src, options?)` | A hidden `<video preload="auto" muted>` at the end of `<body>`. |
| `preloadAudio(src, options?)` | A hidden `<audio preload="auto">` at the end of `<body>`. |
| `preloadImage(src, options?)` | `<link rel="preload" as="image">` in `<head>`. |
| `preloadFont(src, options?)` | `<link rel="preload" as="font" crossorigin="anonymous">` in `<head>`, the form an `@font-face` rule reuses. |
| `resolveRedirect(src)` | Nothing: resolves with the URL after every redirect. |

Options (both optional): `onReady()` is called once the browser holds enough of the asset to show it (media that can play through; an image or font fully loaded), immediately if it already does. `onError(error)` is called if the asset cannot be loaded; without it a warning is logged.

## How preloaded media reaches the Player

Chrome shares a media element's buffered data with every media element of the page that plays the same file, redirects included. So a video preloaded with `preloadVideo()` plays at once when a `<Video>`, `<OffthreadVideo>` or `<Html5Video>` with the same `src` mounts in the Player later (for example in a `<Sequence>` that starts mid-way), and audio does the same through the Player's shared audio tags. Measured in the pinned Chrome on a server that takes 3 s to send the file: without preloading, a video that mounts during playback holds the Player for 3.1 s; preloaded, the Player never stands still for more than 50 ms and the file is downloaded once.

Premounting (`premountFor` on a `<Sequence>`) is the other way to get there; preloading also works across Players and before any Player exists.

## resolveRedirect()

`resolveRedirect(src)` requests `src` and resolves with the final URL once the response headers arrive, without downloading the body. Any status resolves (a 404 resolves with its own URL); a failed request rejects with `fetch()`'s `TypeError`, including a request to another origin that does not allow CORS.

## Compatibility with @remotion/preload

The compat alias maps `@remotion/preload` here, with the same five functions. Checked against `@remotion/preload@4.0.545` in Chrome: `resolveRedirect()` gives the same results on every recorded URL, and each preload function adds the same kind of element in the same place. Deliberate differences:

- Media and images are preloaded from the URL as given. The published package fetches the URL first to resolve redirects (downloading the file once more, and preloading nothing when the server does not allow CORS); Chrome resolves redirects itself and shares the buffer either way.
- `preloadFont()` adds `crossorigin="anonymous"`, without which the browser downloads the font a second time for `@font-face`.
- Calls for the same URL share one element instead of adding one each.
- The `options` argument is a Motio addition.
