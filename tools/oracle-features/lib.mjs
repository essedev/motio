// Helpers shared by the recorders. Only the public APIs of the published
// packages are called: they are treated as black boxes (see
// docs/ARCHITECTURE.md, "Compatibility").

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Version of an installed package, read from its package.json manifest. */
export const versionOf = (name) =>
	JSON.parse(readFileSync(join(here, "node_modules", name, "package.json"), "utf8")).version;

// JSON cannot hold NaN, Infinity or -0: they are written as strings that
// Number() parses back ("NaN", "Infinity", "-Infinity", "-0"). Strings in the
// recorded data that would collide with these are not produced by any grid.
const encodeNumber = (n) => {
	if (typeof n !== "number") return n;
	if (Number.isNaN(n)) return "NaN";
	if (n === Number.POSITIVE_INFINITY) return "Infinity";
	if (n === Number.NEGATIVE_INFINITY) return "-Infinity";
	if (Object.is(n, -0)) return "-0";
	return n;
};

export const encodeDeep = (value) => {
	if (Array.isArray(value)) return value.map(encodeDeep);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeDeep(v)]));
	}
	return encodeNumber(value);
};

/** Runs fn and returns either { out } or { error } with the thrown message. */
export const capture = (fn) => {
	try {
		return { out: fn() };
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e) };
	}
};

/**
 * Writes `packages/<pkg>/src/__oracle__/<name>.json` with the version of the
 * recorded package, a description and the cases.
 */
export const writeFixture = (pkg, remotionPackage, name, description, cases) => {
	const outDir = join(here, "../../packages", pkg, "src/__oracle__");
	mkdirSync(outDir, { recursive: true });
	const body = {
		package: remotionPackage,
		version: versionOf(remotionPackage),
		description,
		cases: encodeDeep(cases),
	};
	const text = `${JSON.stringify(body)}\n`;
	writeFileSync(join(outDir, `${name}.json`), text);
	console.log(`${pkg}/${name}.json: ${cases.length} cases, ${(text.length / 1024).toFixed(0)} KiB`);
	if (text.length > 2_000_000) throw new Error(`${name}.json is over 2 MB, shrink the grid`);
};

/** Deterministic generator for input grids (mulberry32), so re-records are byte-identical. */
export const makeRng = (seed) => {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};
