// The promotional material is a real Motio project: it must type-check, its Open Graph card and a
// frame of the teaser must render at their sizes, and the teaser must be deterministic. Runs the
// built CLI the way a user or an agent does, with --json. The teaser's music (promo/music) mirrors
// the teaser's length and Motio's spring maths to place its accents: both are checked here.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spring } from "@motiojs/motio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as music from "./music/dsp.ts";
import { ensureTeaserMusic } from "./music/ensure.ts";
import { CALM_SPRING } from "./src/brand/tokens.ts";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "packages", "cli", "dist", "bin.js");
const work = mkdtempSync(join(tmpdir(), "motio-promo-"));
// The teaser imports its soundtrack, which is generated (not in git): make it before any bundle.
beforeAll(() => {
	ensureTeaserMusic();
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** Runs `motio <args> --json` in the project and returns the exit code and the parsed result. */
const motio = (...args: string[]) => {
	const run = spawnSync(process.execPath, [cli, ...args, "--json"], {
		cwd: here,
		encoding: "utf8",
		timeout: 120_000,
	});
	return { status: run.status, result: JSON.parse(run.stdout) as Record<string, unknown> };
};

/** Width and height from a PNG's IHDR chunk. */
const pngSize = (file: string) => {
	const png = readFileSync(file);
	return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
};

describe("promo", () => {
	it("type-checks", () => {
		// Throws with the compiler's output if a file fails.
		execFileSync(join(here, "node_modules", ".bin", "tsc"), ["-p", here], { encoding: "utf8" });
	});

	it("renders the Open Graph card at 1200x630", () => {
		const output = join(work, "og-card.png");
		const { status, result } = motio("still", "src/index.ts", "og-card", output);
		expect(status, JSON.stringify(result)).toBe(0);
		expect(pngSize(output)).toEqual({ width: 1200, height: 630 });
	});

	it("renders a frame of the teaser at 1920x1080", () => {
		const output = join(work, "teaser.png");
		const { status, result } = motio("still", "src/index.ts", "teaser", output, "--frame=230");
		expect(status, JSON.stringify(result)).toBe(0);
		expect(pngSize(output)).toEqual({ width: 1920, height: 1080 });
		// The music is generated for exactly this length and frame rate.
		expect(result.composition).toMatchObject({
			fps: music.FPS,
			durationInFrames: music.TOTAL_FRAMES,
		});
	});

	it("places the music's accents where a cut covers half the frame", () => {
		// The cuts are the calm spring stretched over the transition: at music.HALF frames into one,
		// Motio's own spring() must be at 50%.
		const half = spring({
			frame: music.HALF,
			fps: music.FPS,
			config: CALM_SPRING,
			durationInFrames: music.TRANSITION_FRAMES,
		});
		expect(half).toBeCloseTo(0.5, 6);
	});

	it("renders the same teaser frames in any order (check determinism)", () => {
		// The code scene: springs settling, a nested composition, the ruler's playhead.
		const { status, result } = motio(
			"check",
			"determinism",
			"src/index.ts",
			"teaser",
			"--frames=200-219",
		);
		expect(result.ok, JSON.stringify(result)).toBe(true);
		expect(status).toBe(0);
	});
});
