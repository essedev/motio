import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Motio packages every preview page loads, whether or not the project lists them. */
const ALWAYS_EXCLUDED = ["motio", "@motiojs/core", "@motiojs/media", "@motiojs/player"];

const isMotioPackage = (name: string) => name === "motio" || name.startsWith("@motiojs/");

/** Packages Vite pre-bundles itself and that must stay single copies. */
const REACT = new Set(["react", "react-dom"]);

interface Manifest {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
}

function readManifest(path: string): Manifest | null {
	return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Manifest) : null;
}

/**
 * Dependency optimisation settings for the dev server.
 *
 * Motio's browser packages are ES modules that share state through `@motiojs/core` (the
 * composition registry, the timeline contexts). Vite's dependency optimizer would copy core into
 * every package it pre-bundles (`motio`, `@motiojs/fonts`...), while the preview page, imported by
 * path, loads the original: two registries, and the page lists no composition. So the Motio
 * packages are excluded and served as they are, the way a workspace serves linked packages. The
 * third-party dependencies of the React packages among them (`lottie-web`, `three`...), which may
 * be CommonJS, are pre-bundled through Vite's nested `parent > dependency` syntax; Node packages
 * such as `@motiojs/cli` get no such entry, their dependencies never load in the page.
 */
export function motioOptimizeDeps(rootDir: string): { exclude: string[]; include: string[] } {
	const project = readManifest(join(rootDir, "package.json"));
	const listed = Object.keys({
		...project?.dependencies,
		...project?.devDependencies,
	}).filter(isMotioPackage);
	const exclude = [...new Set([...ALWAYS_EXCLUDED, ...listed])].sort();
	const include: string[] = [];
	for (const name of listed) {
		const manifest = readManifest(join(rootDir, "node_modules", name, "package.json"));
		if (!manifest?.peerDependencies?.react) continue;
		const dependencies = Object.keys({ ...manifest?.dependencies, ...manifest?.peerDependencies });
		for (const dependency of dependencies.sort()) {
			if (!isMotioPackage(dependency) && !REACT.has(dependency)) {
				include.push(`${name} > ${dependency}`);
			}
		}
	}
	return { exclude, include };
}
