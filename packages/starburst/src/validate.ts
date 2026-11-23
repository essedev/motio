import { parseColor } from "@motiojs/core/internals";

/** The drawing parameters of a starburst, validated and resolved to their defaults. */
export interface StarburstParams {
	/** Number of rays, from 2 to 100; need not be an integer. */
	rays: number;
	/** Ray colors as 8-bit RGB, assigned to the rays in turn. Alpha is ignored. */
	colors: ReadonlyArray<readonly [number, number, number]>;
	/** Rotation in degrees, clockwise. */
	rotation: number;
	/** Softness of the ray edges, from 0 (hard) to 1. */
	smoothness: number;
	/** Center of the rays on the canvas, `[0, 0]` top left, `[1, 1]` bottom right. */
	origin: readonly [number, number];
	/** Radial fade to transparency, or `null` for none. */
	vignette: number | null;
}

const describe = (value: unknown) =>
	typeof value === "string" ? JSON.stringify(value) : String(value);

const finite = (component: string, name: string, value: unknown): number => {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new TypeError(`${component}: "${name}" is ${describe(value)}; pass a finite number.`);
	}
	return value;
};

const between = (component: string, name: string, value: unknown, min: number, max: number) => {
	const number = finite(component, name, value);
	if (number < min || number > max) {
		throw new RangeError(
			`${component}: "${name}" is ${number}; pass a number from ${min} to ${max}.`,
		);
	}
	return number;
};

/** The raw options shared by `<Starburst>`. */
export interface StarburstInput {
	rays?: unknown;
	colors?: unknown;
	rotation?: unknown;
	smoothness?: unknown;
	vignette?: unknown;
	originOffsetX?: unknown;
	originOffsetY?: unknown;
}

/**
 * Checks the props of `<Starburst>` in the order Remotion does (rays, colors, each color,
 * rotation, smoothness, vignette) and resolves them to drawing parameters. Throws a `TypeError`
 * for a missing or non-numeric value, a `RangeError` for one out of range and an `Error` for a
 * color that does not parse. The origin offsets are not checked, as in Remotion.
 */
export function resolveStarburst(
	input: StarburstInput,
	component = "<Starburst>",
): StarburstParams {
	const rays = between(component, "rays", input.rays, 2, 100);
	const { colors } = input;
	if (!Array.isArray(colors) || colors.length < 2) {
		throw new TypeError(
			`${component}: "colors" is ${Array.isArray(colors) ? `an array of ${colors.length}` : describe(colors)}; pass an array of at least 2 CSS colors.`,
		);
	}
	const rgb = colors.map((color: unknown) => {
		let parsed: readonly number[];
		try {
			parsed = parseColor(color);
		} catch (cause) {
			throw new Error(
				`${component}: "colors" contains ${describe(color)}, which is not a CSS color.`,
				{
					cause,
				},
			);
		}
		return [parsed[0] ?? 0, parsed[1] ?? 0, parsed[2] ?? 0] as const;
	});
	const rotation = input.rotation === undefined ? 0 : finite(component, "rotation", input.rotation);
	const smoothness =
		input.smoothness === undefined ? 0 : between(component, "smoothness", input.smoothness, 0, 1);
	const vignette =
		input.vignette === undefined ? 1 : between(component, "vignette", input.vignette, 0, 1);
	const offsetX = typeof input.originOffsetX === "number" ? input.originOffsetX : 0;
	const offsetY = typeof input.originOffsetY === "number" ? input.originOffsetY : 0;
	return {
		rays,
		colors: rgb,
		rotation,
		smoothness,
		// Measured in Remotion's renders: an offset of 0.5 already reaches an edge, and a positive y
		// moves the origin up. A vignette of 0 turns it off, while leaving it out applies a vignette
		// of 1, which shows on canvases more than about 2.6 times wider than high.
		origin: [0.5 + offsetX, 0.5 - offsetY],
		vignette: vignette === 0 ? null : vignette,
	};
}
