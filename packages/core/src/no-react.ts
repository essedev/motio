/**
 * `@motiojs/core/no-react`: the animation helpers that do not import React, for code that runs
 * outside a React tree (Node scripts, workers). `motio/no-react` re-exports it in place of
 * `remotion/no-react`.
 */
export {
	assertValidInterpolateEasingOption,
	assertValidInterpolatePosterizeOption,
	type ExtrapolateType,
	type InterpolateOptions,
	type InterpolateOutput,
	type InterpolateOutputType,
	interpolate,
} from "./interpolate.js";
export { random } from "./random.js";
