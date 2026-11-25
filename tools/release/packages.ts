// The packages a release publishes and the order it publishes them in. Shared by the release
// scripts and their test: every package of `packages/` that is not private, sorted so that each
// one comes after the workspace packages it depends on (a dependent never reaches the registry
// before what it needs).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = fileURLToPath(new URL("../../", import.meta.url));

/** GitHub repository the packages are published from, as npm's trusted publishing names it. */
export const GITHUB_REPOSITORY = "essedev/motio";
/** The workflow file trusted to publish, by file name only (npm's trusted publisher setting). */
export const RELEASE_WORKFLOW = "release.yml";

export interface Manifest {
	name: string;
	version: string;
	private?: boolean;
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	[key: string]: unknown;
}

export interface PublicPackage {
	/** Folder name under `packages/`. */
	dir: string;
	/** Absolute path of the folder. */
	path: string;
	manifest: Manifest;
}

/** Every package of `packages/` that is published (not private), sorted by name. */
export function publicPackages(repo = REPO): PublicPackage[] {
	const base = join(repo, "packages");
	return readdirSync(base)
		.flatMap((dir) => {
			const file = join(base, dir, "package.json");
			if (!existsSync(file)) return [];
			const manifest = JSON.parse(readFileSync(file, "utf8")) as Manifest;
			return manifest.private ? [] : [{ dir, path: join(base, dir), manifest }];
		})
		.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

/** The workspace packages a package needs at install time (dependencies, peer and optional). */
export function internalDependencies(pkg: PublicPackage, names: ReadonlySet<string>): string[] {
	const { dependencies, peerDependencies, optionalDependencies } = pkg.manifest;
	return [
		...new Set(
			[dependencies, peerDependencies, optionalDependencies].flatMap((deps) =>
				Object.keys(deps ?? {}).filter((name) => names.has(name)),
			),
		),
	].sort();
}

/**
 * The packages in publish order: dependencies first, ties by name, so the order is stable. A
 * cycle between published packages fails, since no order could publish them safely.
 */
export function publishOrder(packages: readonly PublicPackage[]): PublicPackage[] {
	const byName = new Map(packages.map((pkg) => [pkg.manifest.name, pkg]));
	const names = new Set(byName.keys());
	const order: PublicPackage[] = [];
	const state = new Map<string, "visiting" | "done">();
	const visit = (pkg: PublicPackage, path: readonly string[]) => {
		const name = pkg.manifest.name;
		if (state.get(name) === "done") return;
		if (state.get(name) === "visiting") {
			throw new Error(
				`Dependency cycle between published packages: ${[...path, name].join(" -> ")}`,
			);
		}
		state.set(name, "visiting");
		for (const dep of internalDependencies(pkg, names)) {
			visit(byName.get(dep) as PublicPackage, [...path, name]);
		}
		state.set(name, "done");
		order.push(pkg);
	};
	for (const pkg of [...packages].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))) {
		visit(pkg, []);
	}
	return order;
}

/** The one version every published package carries (lockstep), or an error naming the outliers. */
export function lockstepVersion(packages: readonly PublicPackage[]): string {
	const versions = new Set(packages.map((pkg) => pkg.manifest.version));
	if (versions.size !== 1) {
		const list = packages.map((pkg) => `${pkg.manifest.name}@${pkg.manifest.version}`).join(", ");
		throw new Error(`Published packages must share one version; found ${list}`);
	}
	return [...versions][0] as string;
}
