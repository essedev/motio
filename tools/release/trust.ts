// Makes the release workflow a trusted publisher of every public package on npm, so releases
// publish through OIDC without a token. npm accepts the setting only for a package that already
// exists, so this runs once, after the first publish (CONTRIBUTING.md, "Releases").
//
// Needs npm 11.15.0 or later (`npm trust`), an `npm login` session of an account that owns the
// packages and has two-factor authentication on; npm asks for it on the first request. A package
// that already trusts this workflow is skipped; one that trusts something else is reported and
// left alone, since npm keeps one trusted publisher per package.
//
// Usage: node tools/release/trust.ts [--dry-run]
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
	GITHUB_REPOSITORY,
	publicPackages,
	publishOrder,
	RELEASE_WORKFLOW,
	REPO,
} from "./packages.ts";
import { atLeast } from "./publish.ts";

const MIN_NPM_FOR_TRUST = [11, 15, 0] as const;

function npm(args: readonly string[], interactive = false) {
	return new Promise<{ code: number | null; stdout: string }>((done, fail) => {
		const child = spawn("npm", args, {
			cwd: REPO,
			stdio: interactive ? "inherit" : ["ignore", "pipe", "inherit"],
		});
		let stdout = "";
		child.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.on("error", fail);
		child.on("close", (code) => done({ code, stdout }));
	});
}

async function main() {
	const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });
	const version = (await npm(["--version"])).stdout.trim();
	if (!atLeast(version, MIN_NPM_FOR_TRUST)) {
		throw new Error(
			`npm trust needs npm 11.15.0 or later; this is npm ${version} (npm install -g npm@11).`,
		);
	}
	const failed: string[] = [];
	const conflicting: string[] = [];
	for (const pkg of publishOrder(publicPackages())) {
		const name = pkg.manifest.name;
		const list = await npm(["trust", "list", name, "--json"]);
		const current = list.code === 0 ? list.stdout.trim() : "";
		if (current.includes(GITHUB_REPOSITORY) && current.includes(RELEASE_WORKFLOW)) {
			console.log(`skip     ${name} (already trusts ${GITHUB_REPOSITORY} ${RELEASE_WORKFLOW})`);
			continue;
		}
		if (current !== "" && current !== "[]" && current !== "{}") {
			console.log(`conflict ${name}: another trusted publisher is set:\n${current}`);
			conflicting.push(name);
			continue;
		}
		console.log(`trust    ${name}`);
		const args = [
			"trust",
			"github",
			name,
			"--repo",
			GITHUB_REPOSITORY,
			"--file",
			RELEASE_WORKFLOW,
			"--allow-publish",
			"--yes",
		];
		if (values["dry-run"]) args.push("--dry-run");
		const result = await npm(args, true);
		if (result.code !== 0) failed.push(name);
	}
	if (conflicting.length > 0) {
		console.log(
			`\nLeft alone (npm trust list <name>, then npm trust revoke --id <id> <name> to replace): ${conflicting.join(", ")}`,
		);
	}
	if (failed.length > 0)
		throw new Error(`npm trust failed for: ${failed.join(", ")}. Run again to retry them.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main().catch((err: unknown) => {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	});
}
