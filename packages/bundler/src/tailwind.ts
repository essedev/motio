import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { MotioError } from "@motiojs/compat";
import type { CSSOptions, PluginOption } from "vite";
import { resolveModule } from "./resolve.js";

export interface TailwindSetup {
	plugins: PluginOption[];
	css?: CSSOptions;
}

const POSTCSS_CONFIGS = [
	"postcss.config.js",
	"postcss.config.cjs",
	"postcss.config.mjs",
	"postcss.config.ts",
	".postcssrc",
	".postcssrc.json",
];

async function importFromProject(
	specifier: string,
	rootDir: string,
	install: string,
): Promise<unknown> {
	const path = resolveModule(specifier, rootDir);
	if (!path) {
		throw new MotioError(
			"E_TAILWIND_MISSING",
			`The config file enables Tailwind, but "${specifier}" is not installed. Run: ${install}`,
			{ specifier },
		);
	}
	const module = (await import(pathToFileURL(path).href)) as { default?: unknown };
	return module.default ?? module;
}

/**
 * Replaces `enableTailwind()` with the Vite equivalent: `@tailwindcss/vite` for Tailwind 4,
 * the `tailwindcss` PostCSS plugin for Tailwind 3 (unless the project has its own PostCSS
 * config, which Vite loads by itself).
 */
export async function tailwindSetup(version: "v3" | "v4", rootDir: string): Promise<TailwindSetup> {
	if (version === "v4") {
		const factory = await importFromProject(
			"@tailwindcss/vite",
			rootDir,
			"pnpm add -D @tailwindcss/vite",
		);
		if (typeof factory !== "function") {
			throw new MotioError(
				"E_TAILWIND_MISSING",
				'"@tailwindcss/vite" does not export a plugin factory.',
				{},
			);
		}
		return { plugins: [(factory as () => PluginOption)()] };
	}
	if (POSTCSS_CONFIGS.some((name) => existsSync(join(rootDir, name)))) return { plugins: [] };
	const tailwind = await importFromProject("tailwindcss", rootDir, "pnpm add -D tailwindcss@3");
	if (typeof tailwind !== "function") {
		throw new MotioError(
			"E_TAILWIND_MISSING",
			'"tailwindcss" does not export a PostCSS plugin.',
			{},
		);
	}
	return {
		plugins: [],
		css: { postcss: { plugins: [(tailwind as (options?: unknown) => never)()] } },
	};
}
