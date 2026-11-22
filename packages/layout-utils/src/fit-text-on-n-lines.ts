import { measureText, type TextStyle } from "./measure-text.js";

export type FitTextOnNLinesOptions = Omit<TextStyle, "fontSize"> & {
	maxBoxWidth: number;
	maxLines: number;
	/** Upper bound in pixels. Default 2000. */
	maxFontSize?: number;
};

function wrap(
	words: string[],
	style: Omit<TextStyle, "text" | "fontSize">,
	fontSize: number,
	maxBoxWidth: number,
): string[] | null {
	const lines: string[] = [];
	let line = "";
	for (const word of words) {
		const next = line === "" ? word : `${line} ${word}`;
		if (measureText({ ...style, text: next, fontSize }).width <= maxBoxWidth) {
			line = next;
			continue;
		}
		if (line === "") return null;
		lines.push(line);
		if (measureText({ ...style, text: word, fontSize }).width > maxBoxWidth) return null;
		line = word;
	}
	if (line !== "") lines.push(line);
	return lines;
}

/**
 * The largest font size (to 0.01 px) at which `text`, wrapped on spaces, fits in `maxLines`
 * lines of `maxBoxWidth`, and the resulting lines. Browser only.
 */
export function fitTextOnNLines(options: FitTextOnNLinesOptions): {
	fontSize: number;
	lines: string[];
} {
	const { maxBoxWidth, maxLines, maxFontSize = 2000, ...rest } = options;
	const { text, ...style } = rest;
	const words = text.split(" ").filter((w) => w !== "");
	const fits = (size: number) => {
		const lines = wrap(words, style, size, maxBoxWidth);
		return lines !== null && lines.length <= maxLines ? lines : null;
	};
	const atMax = fits(maxFontSize);
	if (atMax) return { fontSize: maxFontSize, lines: atMax };
	let lo = 0;
	let hi = maxFontSize;
	while (hi - lo > 0.01) {
		const mid = (lo + hi) / 2;
		if (fits(mid)) lo = mid;
		else hi = mid;
	}
	const fontSize = Math.floor(lo * 100) / 100;
	return { fontSize, lines: fits(fontSize) ?? [text] };
}
