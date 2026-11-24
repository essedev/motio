// Makes sure promo/music/teaser.wav exists and comes from the current generator. The WAV is not in
// git: a fresh clone, or a change to generate.ts or dsp.ts, regenerates it (about a second). The
// hash of the generator's sources is kept next to the WAV, in teaser.wav.sha256 (also ignored).
// Run: node promo/music/ensure.ts, or import ensureTeaserMusic() before bundling the promo.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCES = ["generate.ts", "dsp.ts"];
export const TEASER_WAV = join(here, "teaser.wav");
const STAMP = `${TEASER_WAV}.sha256`;

/** Regenerates the teaser music if it is missing or stale; returns whether it did. */
export const ensureTeaserMusic = (): boolean => {
	const hash = createHash("sha256");
	for (const file of SOURCES) hash.update(readFileSync(join(here, file)));
	const digest = hash.digest("hex");
	if (
		existsSync(TEASER_WAV) &&
		existsSync(STAMP) &&
		readFileSync(STAMP, "utf8").trim() === digest
	) {
		return false;
	}
	const run = spawnSync(process.execPath, [join(here, "generate.ts")], { encoding: "utf8" });
	if (run.status !== 0) {
		throw new Error(`promo/music/generate.ts failed:\n${run.stderr || run.stdout}`);
	}
	writeFileSync(STAMP, `${digest}\n`);
	return true;
};

if (import.meta.main) {
	console.log(ensureTeaserMusic() ? `generated ${TEASER_WAV}` : `${TEASER_WAV} is up to date`);
}
