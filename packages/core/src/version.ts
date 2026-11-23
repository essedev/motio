/** Motio's own version, kept equal to the package version by a test. */
export const VERSION = "0.0.0";

/**
 * The Remotion API version Motio implements (its compatibility target). Projects that import
 * `remotion` through the compat alias read it as `VERSION`, since libraries use that value to
 * detect which Remotion features exist.
 */
export const REMOTION_API_VERSION = "4.0.545";
