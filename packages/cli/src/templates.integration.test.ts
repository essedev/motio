// M2 proof: official Remotion templates, fetched at pinned commits and left unmodified, build
// through the compat alias and render within the M1 thresholds of Remotion 4.0.545's stills
// (recorded locally into fixtures/templates/.cache/golden/remotion by tools/oracle-render record-templates.ts).
// The templates install nothing: their imports resolve from fixtures/templates/node_modules, a
// parent directory holding Motio's packages and the third-party versions the templates pin.
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createBundle, loadRemotionConfig } from "@motiojs/bundler";
import {
	getCompositions,
	type OpenGlRenderer,
	renderStill,
	selectComposition,
} from "@motiojs/renderer";
import { compareImages, decodeImage, describeBlock, MAX_BLOCK_DIFFERENCE } from "@motiojs/testing";
import type { Plugin } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	fetchTemplate,
	readTemplates,
	TEMPLATES_DIR,
	type TemplateEntry,
} from "../../../fixtures/templates/fetch.ts";
import { defaultDeps, runCli } from "./main.js";
import { testIo } from "./test-support/fakes.js";

// Remotion's renders of its own templates are Remotion's content: they are recorded locally into
// the ignored cache (`pnpm --dir tools/oracle-render record:templates`), never committed.
const GOLDEN = join(TEMPLATES_DIR, ".cache/golden/remotion");
const hasGolden = (name: string) => existsSync(join(GOLDEN, name, "metadata.json"));

// ROADMAP M1 thresholds.
const MEAN_SSIM = 0.99;
const MIN_PSNR_DB = 40;
const WORST_SSIM = 0.97;

interface GoldenMetadata {
	scale: number;
	template: { commit: string };
	compositions: Record<string, Record<string, unknown>>;
}

const templates = readTemplates();
const outDirs: string[] = [];
const scores: Array<{
	template: string;
	id: string;
	frame: number;
	ssim: number;
	psnr: number;
	/** Listed in knownMismatch: reported, but not part of the mean. */
	known: boolean;
}> = [];

async function newOutDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "motio-templates-"));
	outDirs.push(dir);
	return dir;
}

afterAll(async () => {
	await Promise.all(outDirs.map((dir) => rm(dir, { recursive: true, force: true })));
	if (scores.length > 0) {
		const lines = scores.map(
			(s) =>
				`${s.template} ${s.id} ${s.frame}: SSIM ${s.ssim.toFixed(5)}, PSNR ${s.psnr.toFixed(2)} dB${s.known ? " (known mismatch)" : ""}`,
		);
		console.log(`Templates against Remotion 4.0.545:\n${lines.join("\n")}`);
	}
});

/** Records every module that ends up in the bundle. */
function moduleSpy(ids: Set<string>): Plugin {
	return {
		name: "test:module-spy",
		generateBundle() {
			for (const id of this.getModuleIds()) ids.add(id);
		},
	};
}

/** Distinct installed copies of a package among the bundled modules (`.pnpm/<name>@<version>`). */
function copiesOf(ids: Iterable<string>, name: string): Set<string> {
	const copies = new Set<string>();
	const marker = `/node_modules/${name}/`;
	for (const id of ids) {
		const index = id.indexOf(marker);
		if (index !== -1) copies.add(id.slice(0, index + marker.length));
	}
	return copies;
}

/** Bundles a template the way the CLI does: remotion.config loaded, entry found by convention. */
async function bundleTemplate(rootDir: string, ids?: Set<string>) {
	const loaded = await loadRemotionConfig({ rootDir });
	return createBundle({
		entryPoint: "",
		rootDir,
		config: loaded.values,
		outDir: await newOutDir(),
		...(ids
			? {
					viteOverride: (config) => ({
						...config,
						plugins: [...(config.plugins ?? []), moduleSpy(ids)],
					}),
				}
			: {}),
	});
}

const rendered = Object.entries(templates).filter(
	(entry): entry is [string, TemplateEntry & { stills: Record<string, number[]> }] =>
		entry[1].stills !== undefined && entry[1].blockedBy === undefined,
);

for (const [name, template] of rendered) {
	const title = `template ${name}${template.network ? " (loads fonts from the internet)" : ""}`;
	if (!hasGolden(name)) {
		describe.skip(`${title}: no local references, run pnpm --dir tools/oracle-render record:templates`, () => {});
		continue;
	}
	describe(title, () => {
		const golden = JSON.parse(
			readFileSync(join(GOLDEN, name, "metadata.json"), "utf8"),
		) as GoldenMetadata;
		const ids = new Set<string>();
		let rootDir: string;
		let serveUrl: string;

		beforeAll(async () => {
			rootDir = fetchTemplate(name);
			serveUrl = (await bundleTemplate(rootDir, ids)).serveUrl;
		});

		it("is pinned to the commit Remotion's references were recorded from", () => {
			expect(golden.template.commit).toBe(template.commit);
		});

		it("resolves remotion, @remotion/* and React to Motio's packages and one React", () => {
			const all = [...ids];
			expect(all.filter((id) => /\/node_modules\/(?:remotion|@remotion)\//.test(id))).toEqual([]);
			expect(all.some((id) => id.startsWith(resolve(TEMPLATES_DIR, "../../packages/core")))).toBe(
				true,
			);
			expect(copiesOf(all, "react").size).toBe(1);
			expect(copiesOf(all, "react-dom").size).toBe(1);
		});

		it("lists the compositions with Remotion's resolved metadata", async () => {
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
						props: c.props,
					},
				]),
			);
			expect(got).toEqual(golden.compositions);
		});

		it("lists the same compositions through the motio CLI run in the template", async () => {
			const io = testIo(rootDir);
			const code = await runCli(["compositions", "--json"], io, defaultDeps(process.env));
			const result = JSON.parse(io.out.join("")) as {
				compositions: Array<Record<string, unknown> & { id: string }>;
			};
			expect(code, io.err.join("")).toBe(0);
			expect(
				Object.fromEntries(
					result.compositions.map(({ id, width, height, fps, durationInFrames, defaultProps }) => [
						id,
						{ width, height, fps, durationInFrames, defaultProps },
					]),
				),
			).toEqual(
				Object.fromEntries(
					Object.entries(golden.compositions).map(([id, c]) => [
						id,
						{
							width: c.width,
							height: c.height,
							fps: c.fps,
							durationInFrames: c.durationInFrames,
							defaultProps: c.defaultProps,
						},
					]),
				),
			);
		});

		const stills = Object.entries(template.stills).flatMap(([id, frames]) =>
			frames.map((frame) => ({ id, frame, mismatch: template.knownMismatch?.[`${id}/${frame}`] })),
		);
		for (const { id, frame, mismatch } of stills) {
			// A known mismatch is expected to miss the thresholds; the test flips once it is fixed.
			const test = mismatch ? it.fails : it;
			const title = mismatch
				? `renders ${id} frame ${frame} unlike Remotion until fixed: ${mismatch}`
				: `renders ${id} frame ${frame} like Remotion`;
			test(title, async () => {
				const composition = await selectComposition({ serveUrl, id, inputProps: {} });
				const { buffer } = await renderStill({
					serveUrl,
					composition,
					frame,
					scale: golden.scale,
					imageFormat: "png",
					...(template.gl ? { chromiumOptions: { gl: template.gl as OpenGlRenderer } } : {}),
				});
				if (!buffer) throw new Error("renderStill returned no buffer");
				const ours = await decodeImage(buffer);
				const ref = await decodeImage(
					readFileSync(join(GOLDEN, name, id, `${String(frame).padStart(4, "0")}.png`)),
				);
				const {
					ssim: s,
					psnr: p,
					block,
				} = compareImages(`templates-${name}`, id, frame, ours, ref);
				scores.push({ template: name, id, frame, ssim: s, psnr: p, known: mismatch !== undefined });
				expect(s, `${name} ${id} frame ${frame} SSIM`).toBeGreaterThanOrEqual(WORST_SSIM);
				expect(p, `${name} ${id} frame ${frame} PSNR`).toBeGreaterThanOrEqual(MIN_PSNR_DB);
				expect(
					block.max,
					`${name} ${id} frame ${frame}: ${describeBlock(block)}`,
				).toBeLessThanOrEqual(MAX_BLOCK_DIFFERENCE);
			});
		}

		it("meets the mean SSIM threshold over its matching stills", () => {
			const own = scores.filter((s) => s.template === name && !s.known);
			expect(own.length).toBe(stills.filter((still) => still.mismatch === undefined).length);
			if (own.length === 0) return;
			const mean = own.reduce((sum, s) => sum + s.ssim, 0) / own.length;
			expect(mean).toBeGreaterThanOrEqual(MEAN_SSIM);
		});
	});
}

const blocked = Object.entries(templates).filter(
	([, template]) => template.blockedBy !== undefined || template.unsupported !== undefined,
);

// Every template builds since @motiojs/three and @motiojs/animation-utils; the suite stays for
// the next template that cannot.
describe.skipIf(blocked.length === 0)("templates Motio cannot build yet", () => {
	for (const [name, template] of blocked) {
		const blockers = template.blockedBy;
		if (blockers) {
			// Flips when the symbols land: then drop blockedBy and the stills are compared above.
			it(`${name} fails on a missing symbol (${blockers.join("; ")})`, async () => {
				const error = await bundleTemplate(fetchTemplate(name)).catch(
					(caught: unknown) => caught as Error & { code?: string },
				);
				expect(error).toBeInstanceOf(Error);
				expect(error).toMatchObject({ code: "E_BUNDLE" });
				const symbols = blockers.map((b) => b.split("#")[1]?.split(/[ .]/)[0] ?? b);
				expect(symbols.some((symbol) => (error as Error).message.includes(`"${symbol}"`))).toBe(
					true,
				);
			});
		}
		const unsupported = template.unsupported;
		if (unsupported) {
			it(`${name} fails with the compat plugin's message (${unsupported.join(", ")})`, async () => {
				const error = await bundleTemplate(fetchTemplate(name)).catch(
					(caught: unknown) => caught as Error & { code?: string },
				);
				expect(error).toMatchObject({ code: "E_BUNDLE" });
				const message = (error as Error).message;
				const named = unsupported.filter((pkg) => message.includes(`"${pkg}"`));
				expect(named.length, message).toBeGreaterThan(0);
				expect(message).toMatch(/planned for Tier \d \(M\d\)/);
			});
		}
	}
});
