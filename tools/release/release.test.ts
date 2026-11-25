import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	internalDependencies,
	lockstepVersion,
	publicPackages,
	publishOrder,
	REPO,
} from "./packages.ts";
import { atLeast, tarballProblems } from "./publish.ts";

const packages = publicPackages();
const names = new Set(packages.map((pkg) => pkg.manifest.name));
const rootLicense = readFileSync(join(REPO, "LICENSE"), "utf8");

describe("published packages", () => {
	it("are the packages of packages/ except the private test helpers", () => {
		expect(packages.length).toBeGreaterThan(30);
		expect(names.has("@motiojs/testing")).toBe(false);
		expect(names.has("create-motio")).toBe(true);
		for (const name of names)
			expect(name === "create-motio" || name.startsWith("@motiojs/")).toBe(true);
	});

	it("never depend on a private package at install time", () => {
		for (const pkg of packages) {
			const { dependencies, peerDependencies, optionalDependencies } = pkg.manifest;
			for (const dep of Object.keys({
				...dependencies,
				...peerDependencies,
				...optionalDependencies,
			})) {
				if (dep.startsWith("@motiojs/") || dep === "create-motio") {
					expect(names.has(dep), `${pkg.manifest.name} -> ${dep}`).toBe(true);
				}
			}
		}
	});

	it("share one version, which @motiojs/core reports", async () => {
		const version = lockstepVersion(packages);
		const core = await import("../../packages/core/src/version.ts");
		expect(core.VERSION).toBe(version);
	});

	it.each(packages.map((pkg) => [pkg.manifest.name, pkg] as const))(
		"%s carries the release metadata, LICENSE and NOTICE",
		(_, pkg) => {
			const m = pkg.manifest as Record<string, unknown>;
			expect(m.license).toBe("Apache-2.0");
			expect(m.repository).toEqual({
				type: "git",
				url: "git+https://github.com/essedev/motio.git",
				directory: `packages/${pkg.dir}`,
			});
			const readme = existsSync(join(pkg.path, "README.md"));
			// The site has a page for every package with a README (website/src/lib/pages.ts).
			expect(m.homepage).toBe(
				readme ? `https://motio.esse.dev/reference/packages/${pkg.dir}/` : "https://motio.esse.dev",
			);
			expect(m.bugs).toEqual({ url: "https://github.com/essedev/motio/issues" });
			expect(m.publishConfig).toEqual({ access: "public" });
			expect(m.files).toContain("NOTICE");
			expect(readFileSync(join(pkg.path, "LICENSE"), "utf8")).toBe(rootLicense);
			const notice = readFileSync(join(pkg.path, "NOTICE"), "utf8");
			expect(notice.split("\n")[0]).toBe(pkg.manifest.name);
			expect(notice).toMatch(/Copyright 2026 the Motio authors/i);
		},
	);
});

describe("publishOrder", () => {
	it("puts every package after the published packages it needs", () => {
		const order = publishOrder(packages).map((pkg) => pkg.manifest.name);
		expect(order).toHaveLength(packages.length);
		for (const pkg of packages) {
			for (const dep of internalDependencies(pkg, names)) {
				expect(order.indexOf(dep), `${dep} before ${pkg.manifest.name}`).toBeLessThan(
					order.indexOf(pkg.manifest.name),
				);
			}
		}
		expect(order.indexOf("@motiojs/core")).toBeLessThan(order.indexOf("@motiojs/motio"));
		expect(order.indexOf("@motiojs/cli")).toBeLessThan(order.indexOf("create-motio"));
	});

	it("refuses a cycle", () => {
		const fake = (name: string, dep: string) => ({
			dir: name,
			path: name,
			manifest: { name, version: "1.0.0", dependencies: { [dep]: "workspace:*" } },
		});
		expect(() => publishOrder([fake("a", "b"), fake("b", "a")])).toThrow(/cycle.*a -> b -> a/);
	});
});

describe("tarballProblems", () => {
	const files = [
		"package/package.json",
		"package/LICENSE",
		"package/NOTICE",
		"package/dist/index.js",
	];
	it("accepts a packed manifest with released ranges and the legal files", () => {
		expect(
			tarballProblems(
				{ name: "@motiojs/motio", version: "0.1.0" },
				{ name: "@motiojs/motio", version: "0.1.0", dependencies: { "@motiojs/core": "0.1.0" } },
				files,
			),
		).toEqual([]);
	});

	it("names local ranges, a wrong version and missing legal files", () => {
		expect(
			tarballProblems(
				{ name: "@motiojs/motio", version: "0.1.0" },
				{
					name: "@motiojs/motio",
					version: "0.0.0",
					dependencies: { "@motiojs/core": "workspace:*" },
					devDependencies: { x: "link:../x" },
				},
				["package/package.json"],
			),
		).toEqual([
			"version is 0.0.0",
			"dependencies.@motiojs/core is workspace:*",
			"devDependencies.x is link:../x",
			"LICENSE is missing",
			"NOTICE is missing",
		]);
	});
});

it("compares npm versions", () => {
	expect(atLeast("11.5.1", [11, 5, 1])).toBe(true);
	expect(atLeast("11.20.0", [11, 15, 0])).toBe(true);
	expect(atLeast("11.4.9", [11, 5, 1])).toBe(false);
	expect(atLeast("10.99.0", [11, 0, 0])).toBe(false);
	expect(atLeast("12.0.0-pre.1", [11, 15, 0])).toBe(true);
});
