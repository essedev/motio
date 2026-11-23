/**
 * The Studio controls of the `starburst()` effect, as Remotion 4.0.545 publishes them (recorded in
 * `__oracle__/starburst.json`). Plain data: rendering never reads it.
 */
export const starburstEffectSchema = {
	rays: {
		type: "number",
		min: 2,
		max: 100,
		step: 1,
		description: "Number of Rays",
		hiddenFromList: false,
	},
	colors: {
		type: "array",
		item: { type: "color" },
		minLength: 2,
		newItemDefault: "#ff0000",
		description: "Colors",
		keyframable: false,
	},
	rotation: {
		type: "number",
		min: 0,
		max: 360,
		step: 1,
		default: 0,
		description: "Rotation",
		hiddenFromList: false,
	},
	smoothness: {
		type: "number",
		min: 0,
		max: 1,
		step: 0.01,
		default: 0,
		description: "Edge Smoothness",
		hiddenFromList: false,
	},
	origin: {
		type: "uv-coordinate",
		min: 0,
		max: 1,
		step: 0.01,
		default: [0.5, 0.5],
		description: "Origin",
	},
} as const;
