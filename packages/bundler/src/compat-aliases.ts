import { resolveOwnDependency } from "./resolve.js";

/**
 * Remotion specifiers that map into `@motiojs/compat`, pinned to this bundler's own copy:
 * user projects depend on `@motiojs/motio`, not on `@motiojs/compat`, so a strict package manager
 * would not let the project resolve it.
 */
export function compatAliases(): Record<string, string> {
	const aliases: Record<string, string> = {};
	const pairs: Array<[string, string]> = [
		["@remotion/cli/config", "@motiojs/compat/config"],
		["@remotion/tailwind", "@motiojs/compat/tailwind"],
		["@remotion/tailwind-v4", "@motiojs/compat/tailwind-v4"],
	];
	for (const [source, target] of pairs) {
		const path = resolveOwnDependency(target);
		if (path) aliases[source] = path;
	}
	return aliases;
}
