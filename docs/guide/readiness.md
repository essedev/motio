# Readiness

Before each screenshot Motio waits until the frame is ready: images decoded, fonts loaded, video frames shown, no pending state updates. Code of your own that loads something (data from an API, a 3D model, a chart library drawing asynchronously) tells Motio to wait with `delayRender()`, and releases the frame with `continueRender()`:

<!-- example: examples/src/readiness.tsx#delay-render -->
```tsx
import { cancelRender, continueRender, delayRender, staticFile } from "@motiojs/motio";
import { useEffect, useRef } from "react";

// Draws a photo into a canvas with a filter. The canvas is empty until the image is decoded, so
// the effect holds the frame until it has drawn.
export const FilteredPhoto = ({ file, blur }: { file: string; blur: number }) => {
	const canvas = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const handle = delayRender(`Drawing ${file} into the canvas`);
		let active = true;
		fetch(staticFile(file))
			.then((response) => response.blob())
			.then((blob) => createImageBitmap(blob))
			.then((bitmap) => {
				const context = canvas.current?.getContext("2d");
				if (active && context) {
					context.filter = `blur(${blur}px)`;
					context.drawImage(bitmap, 0, 0, context.canvas.width, context.canvas.height);
				}
				continueRender(handle);
			})
			// A missing file fails the render now, with this error, instead of at the timeout.
			.catch((error: unknown) => cancelRender(error));
		return () => {
			active = false;
			continueRender(handle);
		};
	}, [file, blur]);

	return <canvas ref={canvas} width={1280} height={720} />;
};
```

- `delayRender(label)` returns a handle and blocks the capture until `continueRender(handle)` is called. Take the handle in the effect that starts the work and release it in the effect's cleanup too, so a component that unmounts never leaves the frame waiting.
- The label appears in the error when the handle times out, so make it say what was loading.
- `cancelRender(error)` fails the render at once with that error, instead of waiting for the timeout.
- Loading in `calculateMetadata()` (see [Compositions](compositions.md)) needs no handle: the render starts after it resolves. Prefer it for data the whole video needs.

## Timeouts and retries

A handle times out after 30 seconds by default; the render then fails with code `E_READINESS_TIMEOUT`, the label and the frame. `--timeout` (milliseconds) changes the default for a render. A long wait is not silent: every 5 seconds the CLI prints which handle holds which frame (`onDelayRenderPending` in the [Node API](rendering-node.md)):

```text
Waiting on delayRender("Loading the model /models/robot.glb") at frame 0 of Intro: 10/120 s (--timeout=<ms> raises the limit).
```

A handle that is released after more than half its timeout adds a `W_SLOW_READINESS` warning to the render, a sign that the limit is close. Per handle:

<!-- example: examples/src/readiness.tsx#options -->
```tsx
import { useDelayRender } from "@motiojs/motio";
import { useEffect } from "react";

export const ThreeDModel = ({ url }: { url: string }) => {
	const { delayRender, continueRender, cancelRender } = useDelayRender();
	useEffect(() => {
		// Large files over a slow network: wait up to 2 minutes, and if that is not enough,
		// render the frame again on a fresh tab, at most twice, before failing.
		const handle = delayRender(`Loading the model ${url}`, {
			timeoutInMilliseconds: 120_000,
			retries: 2,
		});
		fetch(url)
			.then((response) => response.arrayBuffer())
			.then(() => continueRender(handle))
			.catch((error: unknown) => cancelRender(error));
		return () => continueRender(handle);
	}, [url, delayRender, continueRender, cancelRender]);
	return null;
};
```

With `retries`, a frame whose handle times out is rendered again on a fresh browser tab, which helps with flaky network resources. `useDelayRender()` returns the same three functions, for components that prefer a hook.

## In the preview

`delayRender()` does not hold the preview: the player plays on real time and does not wait. Components should look acceptable while their data loads (the example shows an empty canvas). The preview's Problems panel lists the handles still open, with how long they have been open and where `delayRender()` was called, and a `cancelRender()` with its error, so a handle that is never released shows up before a render times out on it.
