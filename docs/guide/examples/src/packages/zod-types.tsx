import { isValidColor, zColor, zMatrix, zTextarea } from "@motiojs/zod-types";
import { z } from "zod";

// region: schema
export const lowerThirdSchema = z.object({
	// Any CSS colour a browser draws: "#ffb000", "tomato", "rgb(255, 176, 0)", "oklch(0.8 0.17 75)".
	background: zColor(),
	// A string whose line breaks are part of the value.
	text: zTextarea(),
	// A square matrix as a flat array: 1, 4, 9, 16, ... numbers (here a 3x3 colour matrix).
	colorMatrix: zMatrix(),
});

lowerThirdSchema.parse({
	background: "tomato",
	text: "Ada Lovelace\nMathematician",
	colorMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
});

// The same check outside a schema.
isValidColor("#ffb00080"); // true
isValidColor("Tomato"); // false: named colours are lower case
// endregion
