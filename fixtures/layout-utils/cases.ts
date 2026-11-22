// Input grid shared by the oracle recorder and Motio's layout-utils browser test.
export const FONT = "Inter";

export const measureCases = [
	{ text: "remotion", fontFamily: FONT, fontSize: 12 },
	{ text: "remotion", fontFamily: FONT, fontSize: 12, fontWeight: "700" },
	{ text: "The quick brown fox", fontFamily: FONT, fontSize: 48 },
	{ text: "The quick brown fox", fontFamily: FONT, fontSize: "3rem" },
	{ text: "Spacing", fontFamily: FONT, fontSize: 30, letterSpacing: "2px" },
	{ text: "0123456789", fontFamily: FONT, fontSize: 40, fontVariantNumeric: "tabular-nums" },
	{ text: "upper case", fontFamily: FONT, fontSize: 32, textTransform: "uppercase" },
	{ text: "  padded  ", fontFamily: FONT, fontSize: 20 },
	{ text: "", fontFamily: FONT, fontSize: 20 },
	{ text: "Styled", fontFamily: FONT, fontSize: 25, additionalStyles: { fontStyle: "italic", padding: "3px" } },
	{ text: "Tiny", fontFamily: FONT, fontSize: 7.5 },
	{ text: "Very long text that would normally wrap in a narrow box but here does not", fontFamily: FONT, fontSize: 18 },
];

export const fitTextCases = [
	{ text: "Hello", withinWidth: 300, fontFamily: FONT },
	{ text: "Hello World", withinWidth: 1000, fontFamily: FONT, fontWeight: 700 },
	{ text: "Fit me", withinWidth: 123.5, fontFamily: FONT, letterSpacing: "1px" },
	{ text: "CAPS", withinWidth: 500, fontFamily: FONT, textTransform: "uppercase" },
	{ text: "a", withinWidth: 50, fontFamily: FONT },
];

export const fillTextBoxCases = [
	{ maxBoxWidth: 300, maxLines: 2, words: ["Hello", " World!", " How", " are", " you", " doing", " today", " the end"], fontSize: 40 },
	{ maxBoxWidth: 150, maxLines: 3, words: ["A", " longer", " sentence", " with", " several", " words", " to", " wrap", " around"], fontSize: 24 },
	{ maxBoxWidth: 80, maxLines: 1, words: ["Supercalifragilistic", " x"], fontSize: 20 },
];

export const fitTextOnNLinesCases = [
	{ text: "The quick brown fox jumps over the lazy dog", maxBoxWidth: 400, maxLines: 2, fontFamily: FONT },
	{ text: "Short", maxBoxWidth: 300, maxLines: 3, fontFamily: FONT },
	{ text: "One two three four five six seven eight", maxBoxWidth: 250, maxLines: 4, fontFamily: FONT, fontWeight: "700" },
	{ text: "Capped size", maxBoxWidth: 5000, maxLines: 1, fontFamily: FONT, maxFontSize: 120 },
];
