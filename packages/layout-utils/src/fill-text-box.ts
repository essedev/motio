import { measureText, type TextStyle } from "./measure-text.js";

export interface FillTextBoxResult {
	/** Adding the text would exceed the maximum number of lines; it was not added. */
	exceedsBox: boolean;
	/** The text did not fit on the current line and starts a new one. */
	newLine: boolean;
}

/**
 * A text box filled word by word: each `add` reports whether the text starts a new line or
 * would overflow the box. Text that overflows is not added, so later shorter text can still fit.
 */
export function fillTextBox(options: { maxBoxWidth: number; maxLines: number }) {
	const { maxBoxWidth, maxLines } = options;
	const lines: TextStyle[][] = [[]];
	return {
		add(style: TextStyle): FillTextBoxResult {
			const current = lines[lines.length - 1] ?? [];
			const candidate = [...current, style];
			const width = candidate.reduce((sum, s) => sum + measureText(s).width, 0);
			if (width <= maxBoxWidth) {
				current.push(style);
				return { exceedsBox: false, newLine: false };
			}
			if (lines.length + 1 > maxLines) return { exceedsBox: true, newLine: false };
			lines.push([style]);
			return { exceedsBox: false, newLine: true };
		},
	};
}
