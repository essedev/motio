// Updates the "supported" statuses in manifest.json from what Motio's packages export.
// Usage: pnpm --filter @motiojs/compat manifest:status  (builds first)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseManifest } from "../dist/manifest.js";
import { updateManifestStatuses, workspaceExportLoader } from "../dist/manifest-status.js";

const manifestPath = fileURLToPath(new URL("../manifest.json", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

const manifest = parseManifest(readFileSync(manifestPath, "utf8"));
const result = await updateManifestStatuses(manifest, workspaceExportLoader(repositoryRoot));
writeFileSync(manifestPath, `${JSON.stringify(result.manifest, null, "\t")}\n`);

for (const change of result.changes) {
	console.log(`${change.specifier}#${change.symbol}: ${change.from} -> ${change.to}`);
}
if (result.unavailable.length > 0) {
	console.log(`Not available yet: ${[...new Set(result.unavailable)].join(", ")}`);
}
if (result.skipped.length > 0) console.log(`Not checked (wildcard): ${result.skipped.join(", ")}`);
console.log(`${result.changes.length} status change(s) written to manifest.json`);
