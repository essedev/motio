/**
 * The Studio controls of the `lightLeak()` effect, as Remotion 4.0.545 publishes them (recorded in
 * `__oracle__/light-leaks.json`). Plain data: rendering never reads it.
 */
export const lightLeakEffectSchema = {
	seed: { type: "number", default: 0, description: "Seed", hiddenFromList: false },
	hueShift: {
		type: "number",
		min: 0,
		max: 360,
		default: 0,
		description: "Hue Shift",
		hiddenFromList: false,
	},
	progress: {
		type: "number",
		min: 0,
		max: 1,
		step: 0.01,
		default: 0.5,
		description: "Progress",
		hiddenFromList: false,
	},
} as const;
