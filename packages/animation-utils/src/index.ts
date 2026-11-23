/**
 * `@motiojs/animation-utils`, the equivalent of `@remotion/animation-utils`: builders of CSS
 * transform functions, `makeTransform()` to combine them, and `interpolateStyles()` to
 * interpolate whole style objects.
 */
export { type InterpolateStylesOptions, interpolateStyles } from "./interpolate-styles.js";
export { makeTransform } from "./make-transform.js";
export {
	type AngleTransform,
	type LengthTransform,
	matrix,
	matrix3d,
	perspective,
	rotate,
	rotate3d,
	rotateX,
	rotateY,
	rotateZ,
	scale,
	scale3d,
	scaleX,
	scaleY,
	scaleZ,
	skew,
	skewX,
	skewY,
	translate,
	translate3d,
	translateX,
	translateY,
	translateZ,
} from "./transforms.js";
export type {
	AngleUnit,
	AngleUnitString,
	LengthPercentageUnit,
	LengthPercentageUnitString,
	LengthUnit,
	LengthUnitString,
} from "./units.js";
