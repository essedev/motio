const DIGITS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

/**
 * The family name a font module registers and returns: every digit spelled out as a word
 * (`Source Serif 4` becomes `Source Serif Four`, `B612` becomes `BSixOneTwo`), as the published
 * package does. A digit at the start of a word makes an unquoted CSS `font-family` invalid, so
 * `style={{ fontFamily }}` would silently fall back to another font.
 */
export function cssFamilyName(family: string): string {
	return family.replace(/[0-9]/g, (digit) => DIGITS[Number(digit)] as string);
}
