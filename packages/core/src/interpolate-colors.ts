import { type InterpolateOptions, interpolate } from "./interpolate.js";
import { parseColor } from "./parse-color.js";

/** Options of `interpolateColors()`. Extrapolation is always `clamp`. */
export type InterpolateColorsOptions = Pick<InterpolateOptions, "easing" | "posterize">;

const formatAlpha = (alphaByte: number) => Math.round((alphaByte / 255) * 1000) / 1000;

/**
 * Maps `input` from `inputRange` to a color between the colors of
 * `outputRange`, compatible with Remotion's `interpolateColors()`.
 *
 * Colors are parsed to 8-bit RGBA (see the accepted formats on `parseColor`)
 * and each channel is interpolated linearly in gamma-encoded sRGB, clamped at
 * both ends of the range, with the optional `easing` and `posterize` of
 * `interpolate()`. Returns `rgba(r, g, b, a)` with rounded channels and the
 * alpha rounded to 3 decimals.
 *
 * @example interpolateColors(10, [0, 20], ["red", "yellow"]) // "rgba(255, 128, 0, 1)"
 */
export const interpolateColors = (
	input: number,
	inputRange: readonly number[],
	outputRange: readonly string[],
	options?: InterpolateColorsOptions,
): string => {
	if (inputRange.length !== outputRange.length) {
		throw new Error(
			`inputRange (${inputRange.length} values provided) and outputRange (${outputRange.length} values provided) must have the same length`,
		);
	}
	const colors = outputRange.map(parseColor);
	const channelOptions: InterpolateOptions = {
		easing: options?.easing,
		posterize: options?.posterize,
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	};
	const channel = (index: number) =>
		interpolate(
			input,
			inputRange,
			colors.map((c) => c[index] as number),
			channelOptions,
		);
	const [r, g, b, a] = [channel(0), channel(1), channel(2), channel(3)];
	return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${formatAlpha(a)})`;
};
