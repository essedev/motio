/** Text and the CSS properties that affect its layout. */
export interface TextStyle {
	text: string;
	fontFamily: string;
	/** A number is pixels; a string is any CSS `font-size`. */
	fontSize: number | string;
	fontWeight?: number | string;
	/** CSS `letter-spacing`, for example `"1px"`. */
	letterSpacing?: string;
	fontVariantNumeric?: string;
	textTransform?: string;
	/**
	 * Measure a second time with a fallback font and throw if the results are equal, which
	 * means the requested font is not loaded. Default false.
	 */
	validateFontIsLoaded?: boolean;
	/** Further CSS properties that affect the layout of the text. */
	additionalStyles?: Partial<CSSStyleDeclaration> | Record<string, string | number>;
}

export interface TextDimensions {
	width: number;
	height: number;
}

const cache = new Map<string, TextDimensions>();

function measureOnce(style: TextStyle, fontFamily: string): TextDimensions {
	const node = document.createElement("span");
	const s = node.style;
	if (style.additionalStyles) Object.assign(s, style.additionalStyles);
	s.position = "absolute";
	s.top = "-10000px";
	s.whiteSpace = "pre";
	s.fontFamily = fontFamily;
	s.fontSize = typeof style.fontSize === "number" ? `${style.fontSize}px` : style.fontSize;
	if (style.fontWeight !== undefined) s.fontWeight = String(style.fontWeight);
	if (style.letterSpacing !== undefined) s.letterSpacing = style.letterSpacing;
	if (style.fontVariantNumeric !== undefined) s.fontVariantNumeric = style.fontVariantNumeric;
	if (style.textTransform !== undefined) s.textTransform = style.textTransform;
	node.textContent = style.text;
	document.body.appendChild(node);
	const rect = node.getBoundingClientRect();
	node.remove();
	return { width: rect.width, height: rect.height };
}

/**
 * Width and height of `text` rendered with the given style, measured from a real element.
 * Results are cached per argument set. Browser only.
 */
export function measureText(style: TextStyle): TextDimensions {
	const key = JSON.stringify(style);
	const hit = cache.get(key);
	if (hit) return hit;
	const result = measureOnce(style, style.fontFamily);
	if (style.validateFontIsLoaded && style.text.trim() !== "") {
		const fallback = measureOnce(style, style.fontFamily === "serif" ? "monospace" : "serif");
		if (fallback.width === result.width && fallback.height === result.height) {
			throw new Error(
				`measureText(): the font ${JSON.stringify(style.fontFamily)} does not seem to be loaded, because the text measures the same in a fallback font. Load the font, and wait for it, before measuring.`,
			);
		}
	}
	cache.set(key, result);
	return result;
}
