import { z } from "zod";
import { isValidColor } from "./color.js";

export { isValidColor } from "./color.js";

/**
 * A string that must be a colour: hex (3, 4, 6 or 8 digits), a lower-case CSS named colour,
 * `rgb()`/`rgba()`/`hsl()`/`hsla()` in comma syntax, or `hwb()`/`lab()`/`lch()`/`oklab()`/
 * `oklch()` in space syntax with an optional `/ alpha`. Accepts the same inputs as
 * `@remotion/zod-types` (checked against recordings of the published package).
 */
export const zColor = () => z.string().refine(isValidColor, { message: "Invalid color" });

/** A string edited as multi-line text; line breaks are kept in the value. */
export const zTextarea = () => z.string();

/**
 * A square matrix as a flat array of finite numbers: 1, 4, 9, 16, ... elements.
 */
export const zMatrix = () =>
	z.array(z.number()).refine((m) => m.length > 0 && Number.isInteger(Math.sqrt(m.length)), {
		message: "The matrix must be square",
	});
