import type { ConfigValues } from "./values.js";

/** Why a setter call did not take full effect. */
export type ConfigWarningReason =
	/** Recorded, but Motio does not read the value yet. */
	| "planned"
	/** Configures Remotion Studio, which Motio does not have. */
	| "studio"
	/** Configures Remotion Lambda or Cloud Run. */
	| "cloud"
	/** No equivalent in Motio (webpack, Rspack, licensing...). */
	| "no-equivalent"
	/** Deprecated or removed in the compatibility target; mapped to its replacement if any. */
	| "deprecated";

export interface ConfigWarning {
	/** Setter name, e.g. `overrideWebpackConfig`. */
	setter: string;
	reason: ConfigWarningReason;
	message: string;
}

/** Everything `remotion.config.ts` recorded. */
export interface ConfigSnapshot {
	values: Partial<ConfigValues>;
	warnings: ConfigWarning[];
}

interface ConfigStore {
	values: Partial<ConfigValues>;
	warnings: ConfigWarning[];
}

// Kept on globalThis so that a config file loaded through a second copy of this module (for
// example by a module runner) still writes to the store the bundler and the CLI read.
const STORE_KEY = Symbol.for("motiojs.compat.config-store");

function store(): ConfigStore {
	const holder = globalThis as typeof globalThis & { [STORE_KEY]?: ConfigStore };
	holder[STORE_KEY] ??= { values: {}, warnings: [] };
	return holder[STORE_KEY];
}

/** Records one value. Later calls overwrite earlier ones, as in Remotion. */
export function setConfigValue<K extends keyof ConfigValues>(key: K, value: ConfigValues[K]): void {
	store().values[key] = value;
}

/** Records a warning once per setter. */
export function addConfigWarning(warning: ConfigWarning): void {
	const warnings = store().warnings;
	if (!warnings.some((w) => w.setter === warning.setter)) warnings.push(warning);
}

/** Values recorded so far. */
export function getConfigValues(): Readonly<Partial<ConfigValues>> {
	return store().values;
}

/** Warnings recorded so far, in call order. */
export function getConfigWarnings(): readonly ConfigWarning[] {
	return store().warnings;
}

/** A copy of the store, safe to keep after `resetConfig()`. */
export function snapshotConfig(): ConfigSnapshot {
	const { values, warnings } = store();
	return { values: { ...values }, warnings: [...warnings] };
}

/** Clears every recorded value and warning (before loading a config file, and in tests). */
export function resetConfig(): void {
	const current = store();
	current.values = {};
	current.warnings = [];
}
