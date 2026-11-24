// The brand's geometry, palette and springs come from the website's single source (D-077).
export {
	BRAND_SPRING,
	CALM_SPRING,
	LOGO_GEOMETRY,
	markBounds,
	PALETTE,
	type Tone,
	toneColors,
} from "../../../website/src/brand/mark";

/** Muted text on light and on dark grounds (brand/README.md). */
export const MUTED = { onLight: "#6D5770", onDark: "#BEA9C1" } as const;

import { codeTheme } from "../../../website/src/brand/code-theme";

/** Colour of a TextMate scope in the brand's Plum code theme, the one the website uses. */
const scopeColor = (scope: string): string => {
	const rule = codeTheme.tokenColors.find((r) => r.scope.includes(scope));
	if (!rule) throw new Error(`The code theme has no colour for the scope "${scope}".`);
	return rule.settings.foreground;
};

/** Code colours, by the kind of token the promo's highlighter finds. */
export const CODE = {
	background: codeTheme.colors["editor.background"],
	text: codeTheme.colors["editor.foreground"],
	keyword: scopeColor("keyword"),
	tag: scopeColor("entity.name.tag"),
	string: scopeColor("string"),
	number: scopeColor("constant.numeric"),
	comment: scopeColor("comment"),
	fn: scopeColor("entity.name.function"),
	key: scopeColor("meta.object-literal.key"),
	type: scopeColor("entity.name.type"),
	punctuation: scopeColor("punctuation"),
} as const;
