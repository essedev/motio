import { readTailwindMarker, type TailwindVersion } from "../tailwind.js";
import type { ConfigWarning } from "./store.js";
import type { WebpackOverrideFn } from "./values.js";

/** What Motio could make of the webpack overrides in `remotion.config.ts`. */
export interface WebpackOverrideAnalysis {
	/** Set when an override called `enableTailwind`. */
	tailwind: TailwindVersion | null;
	/** One warning per override that changed anything Motio cannot reproduce, or threw. */
	warnings: ConfigWarning[];
}

/** A plausible empty webpack configuration, enough for common overrides to run. */
function standInConfiguration(): Record<string, unknown> {
	return {
		mode: "production",
		entry: {},
		output: {},
		module: { rules: [] },
		resolve: { alias: {}, extensions: [".ts", ".tsx", ".js", ".jsx"], fallback: {} },
		plugins: [],
		optimization: {},
		experiments: {},
	};
}

function fingerprint(configuration: unknown): string {
	return JSON.stringify(configuration, (_key, value: unknown) => {
		if (typeof value === "function") return `[function ${value.name}]`;
		if (value instanceof RegExp) return `[regexp ${value.source}]`;
		return value;
	});
}

/**
 * Runs each override on a stand-in configuration: `enableTailwind` is recognised from the
 * marker it leaves, and any other change is reported as having no equivalent (D-003).
 */
export async function analyzeWebpackOverrides(
	overrides: readonly WebpackOverrideFn[],
): Promise<WebpackOverrideAnalysis> {
	let tailwind: TailwindVersion | null = null;
	const warnings: ConfigWarning[] = [];
	for (const [index, override] of overrides.entries()) {
		const input = standInConfiguration();
		const before = fingerprint(input);
		const label = override.name ? `"${override.name}"` : `#${index + 1}`;
		try {
			const output = await override(input);
			const version = readTailwindMarker(output) ?? readTailwindMarker(input);
			if (version) tailwind = version;
			if (fingerprint(output) !== before) {
				warnings.push({
					setter: "overrideWebpackConfig",
					reason: "no-equivalent",
					message:
						`Config.overrideWebpackConfig() override ${label} changes the webpack configuration, which Motio does not use: ` +
						"Motio bundles with Vite (docs/DECISIONS.md D-003). Reproduce the change with a Vite plugin.",
				});
			}
		} catch (error) {
			warnings.push({
				setter: "overrideWebpackConfig",
				reason: "no-equivalent",
				message:
					`Config.overrideWebpackConfig() override ${label} could not be analysed (${error instanceof Error ? error.message : String(error)}); ` +
					"it has no effect, because Motio bundles with Vite (D-003).",
			});
		}
	}
	return { tailwind, warnings };
}
