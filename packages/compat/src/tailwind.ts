/**
 * `enableTailwind` as imported from `@remotion/tailwind` or `@remotion/tailwind-v4` in
 * `remotion.config.ts`. Motio cannot run webpack overrides; instead the function marks the
 * configuration object it receives, and the bundler, which calls the overrides on a stand-in
 * configuration (see `analyzeWebpackOverrides`), enables Tailwind in its Vite build.
 */

/** Marker property set on the stand-in webpack configuration. */
export const TAILWIND_MARKER: unique symbol = Symbol.for("motiojs.compat.tailwind");

export type TailwindVersion = "v3" | "v4";

type Marked = Record<string, unknown> & { [TAILWIND_MARKER]?: TailwindVersion };

/** Signature of `enableTailwind`, branded with the Tailwind version it enables. */
export interface EnableTailwind {
	<T extends Record<string, unknown>>(currentConfiguration: T, options?: unknown): T;
	readonly [TAILWIND_MARKER]: TailwindVersion;
}

/** Builds an `enableTailwind` for one Tailwind major version. */
export function makeEnableTailwind(version: TailwindVersion): EnableTailwind {
	const enableTailwind = <T extends Record<string, unknown>>(
		currentConfiguration: T,
		_options?: unknown,
	): T => {
		(currentConfiguration as Marked)[TAILWIND_MARKER] = version;
		return currentConfiguration;
	};
	// Branded too, so `Config.overrideWebpackConfig(enableTailwind)` is recognised directly.
	return Object.assign(enableTailwind, { [TAILWIND_MARKER]: version });
}

/** Reads the marker left by `enableTailwind`, if any. */
export function readTailwindMarker(configuration: unknown): TailwindVersion | undefined {
	if (
		(typeof configuration !== "object" && typeof configuration !== "function") ||
		!configuration
	) {
		return undefined;
	}
	return (configuration as Marked)[TAILWIND_MARKER];
}
