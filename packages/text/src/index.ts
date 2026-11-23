/**
 * `@motiojs/text`: text helpers for Motio videos. `<TextBackground>` draws a background shape that
 * follows the lines of a block of text, and `makeTextBackground()` computes that shape from line
 * measurements. `@motiojs/text/rounded-text-box` is the `@remotion/rounded-text-box` preset.
 */
export {
	type MakeTextBackgroundOptions,
	makeTextBackground,
	type TextBackgroundAlign,
	type TextBackgroundLineBox,
	type TextBackgroundShape,
	type TextLineSize,
} from "./make-text-background.js";
export type { TextBackgroundJoin } from "./outline.js";
export {
	TextBackground,
	type TextBackgroundBorder,
	type TextBackgroundProps,
	type TextBackgroundShadow,
} from "./text-background.js";
