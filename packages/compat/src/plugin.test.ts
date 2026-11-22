import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, type Rolldown } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Manifest } from "./manifest.js";
import { type MotioCompatOptions, motioCompat } from "./plugin.js";

let root: string;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "motio-compat-"));
	await mkdir(join(root, "fake"));
	await writeFile(
		join(root, "fake", "motio.js"),
		'export const interpolate = () => "FAKE_MOTIO";\n',
	);
	await writeFile(
		join(root, "fake", "config.js"),
		'export const Config = { marker: "FAKE_CONFIG" };\n',
	);
});
afterAll(() => rm(root, { recursive: true, force: true }));

async function bundle(
	source: string,
	options: MotioCompatOptions = {},
	alias: Record<string, string> = {},
) {
	const entry = join(root, `entry-${Math.random().toString(36).slice(2)}.ts`);
	await writeFile(entry, source);
	const warnings: string[] = [];
	const output = (await build({
		root,
		configFile: false,
		logLevel: "silent",
		plugins: [motioCompat(options)],
		resolve: { alias: { motio: join(root, "fake", "motio.js"), ...alias } },
		build: {
			write: false,
			minify: false,
			lib: { entry, formats: ["es"], fileName: "out" },
			rolldownOptions: { onwarn: (warning) => void warnings.push(warning.message) },
		},
	})) as Rolldown.RolldownOutput[];
	const chunk = output[0]?.output[0];
	return { code: chunk && "code" in chunk ? chunk.code : "", warnings };
}

const manifest: Manifest = {
	target: "remotion@4.0.545",
	sources: [],
	excluded: "",
	modules: {
		remotion: {
			tier: 1,
			symbols: {
				interpolate: { kind: "value", tier: 1, status: "supported" },
				Video: { kind: "value", tier: 1, status: "missing" },
			},
		},
	},
};

describe("motioCompat", () => {
	it("resolves remotion to motio", async () => {
		const { code } = await bundle(
			'import { interpolate } from "remotion";\nexport default interpolate();\n',
		);
		expect(code).toContain("FAKE_MOTIO");
	});

	it("resolves @remotion/cli/config to @motiojs/compat/config", async () => {
		const { code } = await bundle(
			'import { Config } from "@remotion/cli/config";\nexport default Config;\n',
			{},
			{ "@motiojs/compat/config": join(root, "fake", "config.js") },
		);
		expect(code).toContain("FAKE_CONFIG");
	});

	it("fails on an unsupported package with the package, the symbols and the alternative", async () => {
		await expect(
			bundle(
				'import { renderMediaOnLambda } from "@remotion/lambda";\nexport default renderMediaOnLambda;\n',
			),
		).rejects.toThrow(/renderMediaOnLambda from "@remotion\/lambda".*@motiojs\/distributed/s);
	});

	it("fails on an unknown package", async () => {
		await expect(bundle('import "@remotion/made-up";\n')).rejects.toThrow(
			/"@remotion\/made-up".*not in Motio's compatibility table/s,
		);
	});

	it("fails with the roadmap tier when the Motio package is not available yet", async () => {
		await expect(
			bundle('import { evolvePath } from "@remotion/paths";\nexport default evolvePath;\n'),
		).rejects.toThrow(/evolvePath from "@remotion\/paths".*Tier 2 \(M2\)/s);
	});

	it("warns, or fails in strict mode, on symbols the manifest lists as missing", async () => {
		const source =
			'import { interpolate, Video } from "remotion";\nexport default [interpolate, Video];\n';
		const alias = { motio: join(root, "fake", "motio-with-video.js") };
		await writeFile(alias.motio, "export const interpolate = 1; export const Video = 2;\n");
		const { warnings } = await bundle(source, { manifest }, alias);
		expect(warnings.join("\n")).toMatch(
			/"Video" from "remotion" is not implemented in Motio yet \(Tier 1, M1\)/,
		);
		await expect(bundle(source, { manifest, symbols: "error" }, alias)).rejects.toThrow(/"Video"/);
	});

	it("honours extra aliases", async () => {
		const { code } = await bundle(
			'import { interpolate } from "remotion";\nexport default interpolate();\n',
			{ aliases: { remotion: join(root, "fake", "motio.js") }, symbols: "off" },
		);
		expect(code).toContain("FAKE_MOTIO");
	});
});
