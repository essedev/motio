#!/usr/bin/env node
// Writes the digest and size of every archive in DIR into FFMPEG_ARCHIVES of
// packages/ffmpeg/src/manifest.ts. Run it on the archives that will be published, after the
// release workflow or a local build:
//
//   node tools/ffmpeg-build/update-manifest.mjs tools/ffmpeg-build/out
//
// Platforms without an archive in DIR keep their entry. The archive name must match
// ffmpeg-<FFMPEG_VERSION>-<FFMPEG_BUILD>-<platform>.tar.gz of the manifest.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = process.argv[2];
if (!dir) {
	console.error("usage: node tools/ffmpeg-build/update-manifest.mjs DIR");
	process.exit(2);
}
const manifestPath = resolve(import.meta.dirname, "../../packages/ffmpeg/src/manifest.ts");
let manifest = readFileSync(manifestPath, "utf8");
const version = /FFMPEG_VERSION = "([^"]+)"/.exec(manifest)?.[1];
const build = /FFMPEG_BUILD = (\d+)/.exec(manifest)?.[1];
if (!version || !build) throw new Error("FFMPEG_VERSION or FFMPEG_BUILD not found in the manifest");

const pattern = new RegExp(`^ffmpeg-${version.replaceAll(".", "\\.")}-${build}-(.+)\\.tar\\.gz$`);
let updated = 0;
for (const file of readdirSync(dir).sort()) {
	const platform = pattern.exec(file)?.[1];
	if (!platform) continue;
	const bytes = readFileSync(join(dir, file));
	const sha256 = createHash("sha256").update(bytes).digest("hex");
	const size = statSync(join(dir, file)).size;
	const entry = `\t"${platform}": {\n\t\tfile: \`ffmpeg-\${FFMPEG_VERSION}-\${FFMPEG_BUILD}-${platform}.tar.gz\`,\n\t\tsha256: "${sha256}",\n\t\tsize: ${size.toLocaleString("en-US").replaceAll(",", "_")},\n\t},`;
	const existing = new RegExp(`\\t"${platform}": (null,|\\{\\n[\\s\\S]*?\\n\\t\\},)`);
	if (!existing.test(manifest)) throw new Error(`platform ${platform} is not in FFMPEG_ARCHIVES`);
	manifest = manifest.replace(existing, entry);
	console.log(`${platform}: ${sha256} ${size} bytes`);
	updated++;
}
if (updated === 0) throw new Error(`no ffmpeg-${version}-${build}-*.tar.gz archive in ${dir}`);
writeFileSync(manifestPath, manifest);
