import { measureText, type TextStyle } from "./measure-text.js";

/** The size at which text is measured before scaling to the target width. */
const SAMPLE_SIZE = 100;

export type FitTextOptions = Omit<TextStyle, "fontSize"> & { withinWidth: number };

/** The font size in pixels at which `text` is exactly `withinWidth` wide. Browser only. */
export function fitText(options: FitTextOptions): { fontSize: number } {
	const { withinWidth, ...style } = options;
	const { width } = measureText({ ...style, fontSize: SAMPLE_SIZE });
	return { fontSize: (withinWidth / width) * SAMPLE_SIZE };
}
