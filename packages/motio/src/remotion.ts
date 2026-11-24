/**
 * The target of the compat alias for `remotion`: Motio's API, with `VERSION` reporting the Remotion
 * API version Motio implements, because code written for Remotion reads `VERSION` to detect
 * Remotion features. Import `@motiojs/motio` directly to get Motio's own version.
 */
export * from "./index.js";
export { REMOTION_API_VERSION as VERSION } from "./version.js";
