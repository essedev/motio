import { cancelRender, continueRender, delayRender, staticFile, useDelayRender } from "motio";
import { useEffect, useRef } from "react";

// region: delay-render
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
// endregion

// region: options
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
// endregion
