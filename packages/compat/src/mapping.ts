/**
 * How each Remotion package maps to Motio. The plugin and the compatibility report read this
 * table; symbol-level status lives in `manifest.json`.
 */

/** Roadmap tier (docs/ARCHITECTURE.md, "API surface, in tiers"). */
export type Tier = 1 | 2 | 3;

export interface PackageMapping {
	/** Package name as imported in a Remotion project, e.g. `@remotion/transitions`. */
	source: string;
	/**
	 * Motio package that replaces it; subpaths carry over (`@remotion/transitions/fade` maps
	 * to `@motiojs/transitions/fade`). Absent when there is no direct replacement.
	 */
	target?: string;
	tier: Tier;
	/** Milestone in docs/ROADMAP.md where the replacement is delivered. */
	milestone: string;
	/** What to use instead when there is no target, or while the target is not available. */
	alternative?: string;
}

const featurePackage = (name: string, tier: Tier, milestone: string): PackageMapping => ({
	source: `@remotion/${name}`,
	target: `@motiojs/${name}`,
	tier,
	milestone,
});

/** Every known Remotion package. Anything not listed is reported as unknown. */
export const PACKAGE_MAPPINGS: readonly PackageMapping[] = [
	// `motio/remotion` is Motio's API with `VERSION` set to the Remotion API version it implements.
	{ source: "remotion", target: "motio/remotion", tier: 1, milestone: "M1" },
	{ source: "@remotion/bundler", target: "@motiojs/bundler", tier: 1, milestone: "M1" },
	{ source: "@remotion/renderer", target: "@motiojs/renderer", tier: 1, milestone: "M1" },
	{
		source: "@remotion/cli",
		tier: 1,
		milestone: "M1",
		alternative:
			"use the `motio` command line; only `@remotion/cli/config` can be imported (it maps to `@motiojs/compat/config`)",
	},
	featurePackage("media", 1, "M3"),
	featurePackage("player", 1, "M3"),
	featurePackage("transitions", 1, "M2"),
	featurePackage("captions", 1, "M2"),
	featurePackage("google-fonts", 1, "M2"),
	featurePackage("fonts", 1, "M2"),
	featurePackage("zod-types", 1, "M2"),
	{ source: "@remotion/tailwind", target: "@motiojs/compat/tailwind", tier: 1, milestone: "M2" },
	{
		source: "@remotion/tailwind-v4",
		target: "@motiojs/compat/tailwind-v4",
		tier: 1,
		milestone: "M2",
	},
	featurePackage("shapes", 2, "M2"),
	featurePackage("paths", 2, "M2"),
	featurePackage("noise", 2, "M2"),
	featurePackage("layout-utils", 2, "M2"),
	featurePackage("motion-blur", 2, "M5"),
	featurePackage("animation-utils", 2, "M5"),
	featurePackage("three", 2, "M5"),
	featurePackage("media-utils", 2, "M3"),
	featurePackage("effects", 2, "M5"),
	featurePackage("light-leaks", 2, "M5"),
	featurePackage("starburst", 2, "M5"),
	{
		source: "@remotion/lambda",
		tier: 2,
		milestone: "M5",
		alternative: "distributed rendering ships as `@motiojs/distributed` with a Lambda adapter",
	},
	{
		source: "@remotion/cloudrun",
		tier: 2,
		milestone: "M5",
		alternative: "distributed rendering ships as `@motiojs/distributed` with a Cloud Run adapter",
	},
	featurePackage("lottie", 3, "after v1"),
	featurePackage("gif", 3, "after v1"),
	{
		...featurePackage("skia", 3, "after v1"),
		alternative:
			"not implemented yet: React Native Skia needs bundler support and a readiness rule Motio does not have (docs/DECISIONS.md D-063); draw with a <canvas> or @motiojs/three meanwhile",
	},
	featurePackage("rive", 3, "after v1"),
	featurePackage("install-whisper-cpp", 3, "after v1"),
	featurePackage("openai-whisper", 3, "after v1"),
	featurePackage("elevenlabs", 3, "after v1"),
	featurePackage("whisper-web", 3, "after v1"),
	featurePackage("web-renderer", 3, "after v1"),
	featurePackage("preload", 3, "after v1"),
	featurePackage("media-parser", 3, "after v1"),
	featurePackage("webcodecs", 3, "after v1"),
	featurePackage("rounded-text-box", 3, "after v1"),
	{
		source: "@remotion/studio",
		tier: 3,
		milestone: "after v1",
		alternative: "`motio dev` gives a preview page built on the Player",
	},
	{
		source: "@remotion/enable-scss",
		tier: 2,
		milestone: "M2",
		alternative: "Vite compiles `.scss` files once `sass` is installed in the project",
	},
];

const BY_SOURCE = new Map(PACKAGE_MAPPINGS.map((m) => [m.source, m]));

/** Splits a bare specifier into package name and subpath (`""` or `"/fade"`). */
export function splitSpecifier(specifier: string): { packageName: string; subpath: string } {
	const parts = specifier.split("/");
	const length = specifier.startsWith("@") ? 2 : 1;
	return {
		packageName: parts.slice(0, length).join("/"),
		subpath: parts.length > length ? `/${parts.slice(length).join("/")}` : "",
	};
}

/** True when the specifier is `remotion`, `remotion/<sub>` or any `@remotion/*` module. */
export function isRemotionSpecifier(specifier: string): boolean {
	return (
		specifier === "remotion" ||
		specifier.startsWith("remotion/") ||
		specifier.startsWith("@remotion/")
	);
}

/** Where a Remotion specifier goes. */
export type Resolution =
	| { kind: "mapped"; specifier: string; target: string; mapping: PackageMapping }
	| { kind: "unsupported"; specifier: string; mapping: PackageMapping }
	| { kind: "unknown"; specifier: string; packageName: string };

/** Maps one Remotion specifier to its Motio equivalent, without touching the file system. */
export function mapSpecifier(specifier: string): Resolution {
	if (specifier === "@remotion/cli/config") {
		const mapping = BY_SOURCE.get("@remotion/cli") as PackageMapping;
		return { kind: "mapped", specifier, target: "@motiojs/compat/config", mapping };
	}
	const { packageName, subpath } = splitSpecifier(specifier);
	const mapping = BY_SOURCE.get(packageName);
	if (!mapping) return { kind: "unknown", specifier, packageName };
	if (!mapping.target) return { kind: "unsupported", specifier, mapping };
	return { kind: "mapped", specifier, target: `${mapping.target}${subpath}`, mapping };
}

/** Human-readable reason a package cannot be used, for build errors and the report. */
export function describeUnavailable(
	specifier: string,
	mapping: PackageMapping | undefined,
	symbols: readonly string[] = [],
): string {
	const what = symbols.length > 0 ? `${symbols.join(", ")} from "${specifier}"` : `"${specifier}"`;
	if (!mapping) {
		return `Motio has no equivalent for ${what}: the package is not in Motio's compatibility table. Remove the import or open an issue.`;
	}
	const plan = `planned for Tier ${mapping.tier} (${mapping.milestone})`;
	if (mapping.alternative) {
		return `Motio does not support ${what} (${plan}): ${mapping.alternative}.`;
	}
	return `Motio does not provide ${what} yet: ${mapping.target ?? "a replacement"} is ${plan}.`;
}
