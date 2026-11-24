// M4 proof (ROADMAP): every video of two third-party production projects built on Remotion
// (fixtures/projects/projects.json: Remocn and snapcn, MIT, fetched at pinned commits and left
// unmodified) builds through the compat alias, `doctor` reports no missing symbol, its stills match
// the pinned Remotion's within the M1 thresholds, and it passes the flicker check and the
// determinism check against a new page per frame.
// Remotion's renders are the projects' content rendered by Remotion: they are recorded locally
// into fixtures/projects/.cache/golden/remotion (`pnpm --dir tools/oracle-render record:projects`),
// never committed. Without them every suite is skipped.
// The suite renders hundreds of compositions (hours), so it runs only when asked:
// MOTIO_PROJECTS=all, or a list of projects and entries (MOTIO_PROJECTS=remocn/demos,snapcn).
// The results of a run are written to fixtures/projects/.cache/results/<project>.json (ignored).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createBundle, loadRemotionConfig } from "@motiojs/bundler";
import { getCompositions, renderStill, selectComposition } from "@motiojs/renderer";
import { decodeImage, psnr, ssim } from "@motiojs/testing";
import type { Plugin } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	CACHE_DIR,
	fetchProject,
	GL,
	GOLDEN_DIR,
	PROJECTS_DIR,
	readProjects,
	stillName,
} from "../../../fixtures/projects/projects.ts";
import { defaultDeps, runCli } from "./main.js";
import { testIo } from "./test-support/fakes.js";

// ROADMAP M1 thresholds.
const MEAN_SSIM = 0.99;
const MIN_PSNR_DB = 40;
const WORST_SSIM = 0.97;

/** Frames of the determinism check: a window around the middle of the composition. */
const DETERMINISM_FRAMES = 20;
/** Render concurrency of the checks: modest, other work shares the machine. */
const CHECK_CONCURRENCY = "3";

interface GoldenComposition {
	width: number;
	height: number;
	fps: number;
	durationInFrames: number;
	defaultProps: Record<string, unknown>;
	frames: number[];
	/** Frames Remotion itself could not render, with its error. */
	renderErrors?: Record<string, string>;
}

interface GoldenEntry {
	remotion: string;
	project: { commit: string };
	entry: string;
	scale: number;
	gl: string;
	/** Remotion itself could not bundle the entry. */
	bundleError?: string;
	compositions?: Record<string, GoldenComposition>;
}

interface CompositionResult {
	frames: number;
	stills: Array<{ frame: number; ssim: number; psnr: number }>;
	meanSsim?: number;
	minPsnr?: number;
	worstSsim?: number;
	flicker?: { clean: boolean; flagged: number[] } | { error: string };
	determinism?: { deterministic: boolean; mismatches: number[] } | { error: string };
	renderError?: string;
}

interface EntryResult {
	build: "ok" | "failed" | "remotion-failed";
	buildError?: string;
	metadataMatches?: boolean;
	compositions: Record<string, CompositionResult>;
}

const requested = process.env.MOTIO_PROJECTS ?? "";
const filters = requested === "all" ? [] : requested.split(",").filter(Boolean);
const wanted = (project: string, entry?: string) =>
	requested === "all" ||
	filters.includes(project) ||
	(entry !== undefined && filters.includes(`${project}/${entry}`)) ||
	(entry === undefined && filters.some((f) => f.startsWith(`${project}/`)));

const projects = readProjects();
const results: Record<string, { doctor?: unknown; entries: Record<string, EntryResult> }> = {};
const outDirs: string[] = [];

async function newOutDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "motio-projects-"));
	outDirs.push(dir);
	return dir;
}

function readGolden(project: string, entry: string): GoldenEntry | null {
	const file = join(GOLDEN_DIR, project, entry, "metadata.json");
	return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as GoldenEntry) : null;
}

/** Records every module that ends up in the bundle. */
function moduleSpy(ids: Set<string>): Plugin {
	return {
		name: "test:module-spy",
		generateBundle() {
			for (const id of this.getModuleIds()) ids.add(id);
		},
	};
}

/** Runs the motio CLI in the project directory and parses its `--json` output. */
async function motioJson(
	rootDir: string,
	argv: string[],
): Promise<{ code: number; result: Record<string, unknown>; err: string }> {
	const io = testIo(rootDir);
	const code = await runCli([...argv, "--json"], io, defaultDeps(process.env));
	const text = io.out.join("");
	let result: Record<string, unknown> = {};
	try {
		result = JSON.parse(text) as Record<string, unknown>;
	} catch {
		result = { unparsed: text };
	}
	return { code, result, err: io.err.join("") };
}

function errorText(result: { result: Record<string, unknown>; err: string }): string {
	const error = result.result.error as { code?: string; message?: string } | undefined;
	return error ? `${error.code ?? ""} ${error.message ?? ""}`.trim() : result.err.slice(0, 2000);
}

afterAll(async () => {
	await Promise.all(outDirs.map((dir) => rm(dir, { recursive: true, force: true })));
	const resultsDir = join(CACHE_DIR, "results");
	mkdirSync(resultsDir, { recursive: true });
	for (const [project, result] of Object.entries(results)) {
		writeFileSync(join(resultsDir, `${project}.json`), `${JSON.stringify(result, null, "\t")}\n`);
	}
});

if (requested === "") {
	describe.skip("M4 projects: set MOTIO_PROJECTS=all (or projects and entries) to render them", () => {});
}

for (const [name, project] of Object.entries(projects)) {
	if (!wanted(name)) continue;
	const recorded = Object.keys(project.entries).some((id) => readGolden(name, id) !== null);
	if (!recorded) {
		describe.skip(`project ${name}: no local references, run pnpm --dir tools/oracle-render record:projects`, () => {});
		continue;
	}
	results[name] = { entries: {} };
	const projectResult = results[name];

	describe(`project ${name}`, () => {
		let rootDir: string;
		beforeAll(() => {
			rootDir = fetchProject(name);
		});

		it("doctor reports no missing symbol", async () => {
			const doctor = await motioJson(rootDir, ["doctor"]);
			const report = doctor.result.compatibility as
				| { entries: Array<{ symbol: string; specifier: string; status: string }> }
				| undefined;
			const blocking = (report?.entries ?? []).filter((entry) =>
				["missing", "unknown-symbol", "unsupported-package", "unknown-package"].includes(
					entry.status,
				),
			);
			projectResult.doctor = blocking.map((e) => `${e.symbol} from ${e.specifier} (${e.status})`);
			expect(report, errorText(doctor)).toBeDefined();
			expect(projectResult.doctor).toEqual([]);
		});
	});

	for (const [id, entry] of Object.entries(project.entries)) {
		if (!wanted(name, id)) continue;
		const golden = readGolden(name, id);
		if (!golden) {
			describe.skip(`${name}/${id}: no local references, run pnpm --dir tools/oracle-render record:projects ${name}/${id}`, () => {});
			continue;
		}
		const entryResult: EntryResult = { build: "ok", compositions: {} };
		projectResult.entries[id] = entryResult;
		if (golden.bundleError !== undefined) {
			entryResult.build = "remotion-failed";
			entryResult.buildError = golden.bundleError;
			describe.skip(`${name}/${id}: Remotion itself cannot bundle it (${golden.bundleError.split("\n")[0]})`, () => {});
			continue;
		}
		const compositions = golden.compositions ?? {};

		describe(`${name}/${id} (${entry.file})`, () => {
			const ids = new Set<string>();
			let rootDir: string;
			let serveUrl: string | undefined;
			let bundleError: unknown;

			beforeAll(async () => {
				rootDir = fetchProject(name);
				try {
					// Bundled the way the CLI does: the project's config, the entry as the project's
					// scripts pass it, no option a Remotion user would not set.
					const loaded = await loadRemotionConfig({ rootDir });
					serveUrl = (
						await createBundle({
							entryPoint: entry.file,
							rootDir,
							config: loaded.values,
							outDir: await newOutDir(),
							viteOverride: (config) => ({
								...config,
								plugins: [...(config.plugins ?? []), moduleSpy(ids)],
							}),
						})
					).serveUrl;
				} catch (error) {
					bundleError = error;
					entryResult.build = "failed";
					entryResult.buildError = error instanceof Error ? error.message : String(error);
				}
			});

			it("is pinned to the commit Remotion's references were recorded from", () => {
				expect(golden.project.commit).toBe(project.commit);
			});

			it("builds through the alias, with no Remotion package and one React", () => {
				expect(bundleError, String(bundleError)).toBeUndefined();
				const all = [...ids];
				expect(all.filter((m) => /\/node_modules\/(?:remotion|@remotion)\//.test(m))).toEqual([]);
				const reactCopies = new Set(
					all.flatMap((m) => {
						const index = m.indexOf("/node_modules/react/");
						return index === -1 ? [] : [m.slice(0, index)];
					}),
				);
				expect(reactCopies.size).toBe(1);
			});

			it("lists Remotion's compositions with the same metadata", async () => {
				if (!serveUrl) throw new Error(`not built: ${String(bundleError)}`);
				const list = await getCompositions({ serveUrl, inputProps: {} });
				const got = Object.fromEntries(
					list.map((c) => [
						c.id,
						{
							width: c.width,
							height: c.height,
							fps: c.fps,
							durationInFrames: c.durationInFrames,
							defaultProps: c.defaultProps,
						},
					]),
				);
				const expected = Object.fromEntries(
					Object.entries(compositions).map(([cid, c]) => [
						cid,
						{
							width: c.width,
							height: c.height,
							fps: c.fps,
							durationInFrames: c.durationInFrames,
							defaultProps: c.defaultProps,
						},
					]),
				);
				entryResult.metadataMatches = JSON.stringify(got) === JSON.stringify(expected);
				expect(got).toEqual(expected);
			});

			for (const [cid, composition] of Object.entries(compositions)) {
				const result: CompositionResult = { frames: composition.durationInFrames, stills: [] };
				entryResult.compositions[cid] = result;
				const referenced = composition.frames.filter(
					(frame) => composition.renderErrors?.[frame] === undefined,
				);

				it.skipIf(referenced.length === 0)(
					`renders ${cid} like Remotion (frames ${referenced.join(", ")})`,
					async () => {
						if (!serveUrl) throw new Error(`not built: ${String(bundleError)}`);
						try {
							const selected = await selectComposition({ serveUrl, id: cid, inputProps: {} });
							for (const frame of referenced) {
								const { buffer } = await renderStill({
									serveUrl,
									composition: selected,
									frame,
									scale: golden.scale,
									imageFormat: "png",
									chromiumOptions: { gl: GL },
								});
								if (!buffer) throw new Error("renderStill returned no buffer");
								const ours = await decodeImage(buffer);
								const ref = await decodeImage(
									readFileSync(join(GOLDEN_DIR, name, id, cid, stillName(frame))),
								);
								result.stills.push({ frame, ssim: ssim(ours, ref), psnr: psnr(ours, ref) });
							}
						} catch (error) {
							result.renderError = error instanceof Error ? error.message : String(error);
							throw error;
						}
						const s = result.stills.map((still) => still.ssim);
						result.meanSsim = s.reduce((sum, v) => sum + v, 0) / s.length;
						result.worstSsim = Math.min(...s);
						result.minPsnr = Math.min(...result.stills.map((still) => still.psnr));
						expect(result.worstSsim, `${cid} worst frame SSIM`).toBeGreaterThanOrEqual(WORST_SSIM);
						expect(result.minPsnr, `${cid} PSNR`).toBeGreaterThanOrEqual(MIN_PSNR_DB);
						expect(result.meanSsim, `${cid} mean SSIM`).toBeGreaterThanOrEqual(MEAN_SSIM);
					},
					Math.max(120_000, referenced.length * 60_000),
				);

				it(
					`${cid} passes the flicker check over its ${composition.durationInFrames} frames`,
					async () => {
						const run = await motioJson(rootDir, [
							"check",
							"flicker",
							entry.file,
							cid,
							"--frames=0-",
							`--concurrency=${CHECK_CONCURRENCY}`,
						]);
						const flagged = (run.result.flagged as Array<{ frame: number }> | undefined)?.map(
							(f) => f.frame,
						);
						result.flicker =
							run.result.clean === undefined
								? { error: errorText(run) }
								: { clean: run.result.clean === true, flagged: flagged ?? [] };
						expect(run.result.clean, errorText(run)).toBe(true);
					},
					Math.max(180_000, composition.durationInFrames * 400),
				);

				const first = Math.max(
					0,
					Math.floor(composition.durationInFrames / 2) - DETERMINISM_FRAMES / 2,
				);
				const last = Math.min(composition.durationInFrames - 1, first + DETERMINISM_FRAMES - 1);
				it(`${cid} renders frames ${first}-${last} like a new page per frame, in any order`, async () => {
					const run = await motioJson(rootDir, [
						"check",
						"determinism",
						entry.file,
						cid,
						"--reference=fresh",
						`--frames=${first}-${last}`,
						`--concurrency=${CHECK_CONCURRENCY}`,
					]);
					const mismatches = (run.result.mismatches as Array<{ frame: number }> | undefined)?.map(
						(m) => m.frame,
					);
					result.determinism =
						run.result.deterministic === undefined
							? { error: errorText(run) }
							: {
									deterministic: run.result.deterministic === true,
									mismatches: mismatches ?? [],
								};
					expect(run.result.deterministic, errorText(run)).toBe(true);
				}, 600_000);
			}
		});
	}
}

// The project parent: its node_modules is where the unmodified projects resolve their imports.
it.skipIf(Object.keys(results).length === 0)(
	"the projects resolve their imports from fixtures/projects/node_modules",
	() => {
		expect(existsSync(resolve(PROJECTS_DIR, "node_modules/@motiojs/motio"))).toBe(true);
	},
);
