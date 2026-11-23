// `import { Config } from "remotion"` is the configuration API of Remotion 3, which moved to
// `@remotion/cli/config` in 4.0. The published package still exports `Config`: any setter
// prints a migration message and exits the process. Motio keeps the same shape (recorded in
// packages/core/src/__oracle__/exports.json) and throws an Error with its own message instead of
// exiting (docs/DECISIONS.md, D-045 and D-054).

/** A setter of the deprecated `Config`: calling it throws the migration message. */
export type DeprecatedConfigSetter = (...args: unknown[]) => never;

/** The namespaces of Remotion 3's `Config` (`Config.Rendering.setImageFormat()`, ...). */
export type DeprecatedConfigNamespace = "Rendering" | "Output" | "Bundling" | "Log" | "Puppeteer";

/** The deprecated `Config` of `remotion`: every setter, at any depth, throws. */
export type DeprecatedConfig = { readonly [setter: string]: DeprecatedConfigSetter } & {
	readonly [namespace in DeprecatedConfigNamespace]: DeprecatedConfig;
};

/** The message of every setter, pointing to the import that replaces it. */
export const CONFIG_MOVED_MESSAGE =
	'Config from "remotion" is the configuration API of Remotion 3 and does nothing in Motio. In the config file, import it from "@remotion/cli/config" instead: import { Config } from "@remotion/cli/config";';

const NAMESPACES: ReadonlySet<PropertyKey> = new Set<DeprecatedConfigNamespace>([
	"Rendering",
	"Output",
	"Bundling",
	"Log",
	"Puppeteer",
]);

const moved: DeprecatedConfigSetter = () => {
	throw new Error(CONFIG_MOVED_MESSAGE);
};

const makeConfig = (): DeprecatedConfig => {
	let namespace: DeprecatedConfig | undefined;
	return new Proxy({} as DeprecatedConfig, {
		get(_target, key) {
			if (NAMESPACES.has(key)) {
				namespace ??= makeConfig();
				return namespace;
			}
			// A fresh function per access, like the published package.
			return (...args: unknown[]) => moved(...args);
		},
	});
};

/**
 * Deprecated: Remotion 3's configuration object. Any setter throws a message telling to import
 * `Config` from `@remotion/cli/config` instead, which Motio maps to `@motiojs/compat/config`.
 */
export const Config: DeprecatedConfig = makeConfig();
