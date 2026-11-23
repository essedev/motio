// Renders the official Remotion templates (fixtures/templates/templates.json) with the published
// Remotion at the pinned version: reference stills and resolved composition
// metadata, written to fixtures/templates/.cache/golden/remotion/<template>/ (ignored). Each template is
// fetched at its pinned commit (never vendored), and its src/ and public/ are copied unchanged
// (with its package.json) next to this project so that remotion and @remotion/* resolve to the pinned packages here.
// As in the template's own README, the Node APIs do not apply remotion.config.ts.
// Public APIs only (clean room: never open files under node_modules).
// Run: pnpm record:templates [template...]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderStill, selectComposition } from "@remotion/renderer";
import { fetchTemplate, readTemplates } from "../../fixtures/templates/fetch.ts";

/**
 * Scale of every reference still. 1, not smaller: below 1 Motio's and Remotion's rasterisation
 * differ (device scale factor), which would hide template differences behind renderer ones.
 */
const SCALE = 1;

const here = import.meta.dirname;
// Ignored cache: Remotion's renders of its own templates are its content, never committed.
const goldenRoot = resolve(here, "../../fixtures/templates/.cache/golden/remotion");
const version = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).dependencies
	.remotion as string;
const templates = readTemplates();
const names =
	process.argv.length > 2
		? process.argv.slice(2)
		: Object.keys(templates).filter((name) => templates[name]?.stills);

for (const name of names) {
	const template = templates[name];
	if (!template?.stills) throw new Error(`${name} has no stills in templates.json`);
	const source = fetchTemplate(name);
	const work = join(here, ".work-templates", name);
	rmSync(work, { recursive: true, force: true });
	cpSync(join(source, "src"), join(work, "src"), { recursive: true });
	// The template's package.json (no "type": "module") decides how .js files are parsed;
	// without it this project's "type": "module" makes extensionless imports in .js fail.
	cpSync(join(source, "package.json"), join(work, "package.json"));
	const hasPublic = existsSync(join(source, "public"));
	if (hasPublic) cpSync(join(source, "public"), join(work, "public"), { recursive: true });
	const entry = ["src/index.ts", "src/index.tsx", "src/index.js", "src/index.jsx"].find((file) =>
		existsSync(join(work, file)),
	);
	if (!entry) throw new Error(`${name}: no src/index.{ts,tsx,js,jsx}`);

	const serveUrl = await bundle({
		entryPoint: join(work, entry),
		...(hasPublic ? { publicDir: join(work, "public") } : {}),
	});
	const chromiumOptions = template.gl ? { gl: template.gl as "swangle" } : {};
	const comps = await getCompositions(serveUrl, { inputProps: {}, chromiumOptions });
	const out = join(goldenRoot, name);
	rmSync(out, { recursive: true, force: true });
	const metadata = {
		remotion: version,
		template: { repository: template.repository, commit: template.commit },
		scale: SCALE,
		...(template.gl ? { gl: template.gl } : {}),
		compositions: {} as Record<string, unknown>,
	};
	for (const { id } of comps) {
		const composition = await selectComposition({ serveUrl, id, inputProps: {}, chromiumOptions });
		metadata.compositions[id] = {
			width: composition.width,
			height: composition.height,
			fps: composition.fps,
			durationInFrames: composition.durationInFrames,
			defaultProps: composition.defaultProps,
			props: composition.props,
		};
		const frames = template.stills[id] ?? [];
		mkdirSync(join(out, id), { recursive: true });
		for (const frame of frames) {
			await renderStill({
				composition,
				serveUrl,
				frame,
				scale: SCALE,
				imageFormat: "png",
				output: join(out, id, `${String(frame).padStart(4, "0")}.png`),
				inputProps: {},
				chromiumOptions,
			});
		}
		console.log(`${name} ${id}: ${frames.length} stills`);
	}
	const missing = Object.keys(template.stills).filter((id) => !(id in metadata.compositions));
	if (missing.length > 0) throw new Error(`${name}: no composition ${missing.join(", ")}`);
	writeFileSync(join(out, "metadata.json"), `${JSON.stringify(metadata, null, "\t")}\n`);
	rmSync(work, { recursive: true, force: true });
}
rmSync(join(here, ".work-templates"), { recursive: true, force: true });
