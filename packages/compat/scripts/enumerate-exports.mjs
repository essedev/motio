// Lists the runtime export NAMES of the compatibility target's packages, to rebuild or
// check manifest.json when the target moves (docs/DECISIONS.md D-008).
//
// Clean room: the packages are installed in a temporary directory outside the repository
// and only `Object.keys()` of each module is read; no package file is opened.
//
// Usage: pnpm --filter @motiojs/compat manifest:enumerate [--check]
//   --check  compare with manifest.json and list names added or removed upstream.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const version = manifest.target.split("@")[1];
const specifiers = Object.keys(manifest.modules).map((key) =>
	key.endsWith("/*") ? `${key.slice(0, -2)}/Roboto` : key,
);
const packages = [
	...new Set(
		specifiers.map((s) =>
			s
				.split("/")
				.slice(0, s.startsWith("@") ? 2 : 1)
				.join("/"),
		),
	),
];
const INTEROP = new Set(["__esModule", "default", "module.exports"]);

const directory = mkdtempSync(join(tmpdir(), "motio-enumerate-"));
try {
	writeFileSync(
		join(directory, "package.json"),
		'{"name":"enumerate","private":true,"type":"module"}',
	);
	execFileSync(
		"pnpm",
		[
			"add",
			"--ignore-scripts",
			"react@19",
			"react-dom@19",
			"zod",
			"three",
			...packages.map((p) => `${p}@${version}`),
		],
		{ cwd: directory, stdio: "inherit" },
	);
	const probe = `
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(${JSON.stringify(join(directory, "package.json"))});
const out = {};
for (const s of ${JSON.stringify(specifiers)}) {
	try { out[s] = Object.keys(await import(pathToFileURL(require.resolve(s)).href)); }
	catch (e) { out[s] = { error: String(e && e.message) }; }
}
console.log(JSON.stringify(out));`;
	const raw = execFileSync(process.execPath, ["-C", "import", "--input-type=module", "-e", probe], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "inherit"],
	});
	const names = JSON.parse(raw);
	if (!process.argv.includes("--check")) {
		console.log(JSON.stringify(names, null, 1));
	} else {
		let differences = 0;
		for (const [key, module] of Object.entries(manifest.modules)) {
			const specifier = key.endsWith("/*") ? `${key.slice(0, -2)}/Roboto` : key;
			const upstream = names[specifier];
			if (!Array.isArray(upstream)) {
				console.log(`${key}: could not load (${upstream?.error})`);
				differences++;
				continue;
			}
			const listed = new Set(
				Object.entries(module.symbols)
					.filter(([, s]) => s.kind === "value")
					.map(([n]) => n),
			);
			const publicNames = upstream.filter(
				(n) =>
					!INTEROP.has(n) &&
					!n.endsWith("Internals") &&
					n !== "NoReactAPIs" &&
					n !== "BrowserSafeApis",
			);
			for (const n of publicNames)
				if (!listed.has(n)) {
					console.log(`${key}: + ${n}`);
					differences++;
				}
			for (const n of listed)
				if (!publicNames.includes(n)) {
					console.log(`${key}: - ${n}`);
					differences++;
				}
		}
		console.log(`${differences} difference(s) against manifest.json`);
		process.exitCode = differences > 0 ? 1 : 0;
	}
} finally {
	rmSync(directory, { recursive: true, force: true });
}
