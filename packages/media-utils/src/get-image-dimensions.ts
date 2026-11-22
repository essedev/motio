import { memoizeBySrc } from "./media-element.js";
import type { ImageDimensions } from "./types.js";

const load = memoizeBySrc(
	(src) =>
		new Promise<ImageDimensions>((resolve, reject) => {
			const image = new Image();
			image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
			image.onerror = (event) =>
				reject(new Error(`Failed to load the image "${src}"`, { cause: event }));
			image.src = src;
		}),
);

/** Natural width and height of an image in pixels. Memoized by `src`. */
export function getImageDimensions(src: string): Promise<ImageDimensions> {
	return load(src);
}
