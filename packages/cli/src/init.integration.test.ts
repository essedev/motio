// M6: every starter of `motio init` installs, type-checks, renders a still and a video, and
// previews with `motio dev`, with no edits. The Motio packages are not on npm, so the test packs
// the workspace packages the projects need (`pnpm pack`, which applies each package's `files`
// list and rewrites `workspace:` ranges, as publishing does) and points the project at the
// tarballs through pnpm overrides. Everything runs through the project's own installed `motio`.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureBrowser } from "@motiojs/renderer";
import puppeteer from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testChromeArgs } from "../../testing/src/browser.js";
import { STARTERS } from "./init/starters.js";
import { defaultDeps, runCli } from "./main.js";
import { testIo, validator } from "./test-support/fakes.js";

const PACKAGES_DIR = fileURLToPath(new URL("../../", import.meta.url));
const ffprobe = process.env.MOTIO_FFPROBE ?? "ffprobe";
const validate = validator();

interface Manifest {
	name: string;
	version: string;
	dependencies?: Record<string, string>;
}

/** Workspace packages by name, with their directories. */
function workspacePackages(): Map<string, { dir: string; manifest: Manifest }> {
	const packages = new Map<string, { dir: string; manifest: Manifest }>();
	for (const entry of readdirSync(PACKAGES_DIR)) {
		const file = join(PACKAGES_DIR, entry, "package.json");
		if (!existsSync(file)) continue;
		const manifest = JSON.parse(readFileSync(file, "utf8")) as Manifest;
		packages.set(manifest.name, { dir: join(PACKAGES_DIR, entry), manifest });
	}
	return packages;
}

/** `roots` and every workspace package they depend on at run time, transitively. */
function closure(roots: readonly string[]): string[] {
	const packages = workspacePackages();
	const seen = new Set<string>();
	const visit = (name: string) => {
		if (seen.has(name)) return;
		const found = packages.get(name);
		if (!found) throw new Error(`${name} is not a workspace package.`);
		seen.add(name);
		for (const [dependency, range] of Object.entries(found.manifest.dependencies ?? {})) {
			if (range.startsWith("workspace:")) visit(dependency);
		}
	};
	for (const root of roots) visit(root);
	return [...seen].sort();
}

function run(
	command: string,
	args: readonly string[],
	cwd: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => resolve({ code, stdout, stderr }));
	});
}

/** Runs the project's installed `motio` with `--json` and returns the validated result. */
async function motio(dir: string, args: readonly string[], schema: string) {
	const { code, stdout, stderr } = await run(
		join(dir, "node_modules/.bin/motio"),
		[...args, "--json"],
		dir,
	);
	const result = JSON.parse(stdout) as Record<string, unknown>;
	expect(validate(schema, result), JSON.stringify(result).slice(0, 2000)).toBeNull();
	expect({ code, ok: result.ok }, `${stdout}\n${stderr}`).toEqual({ code: 0, ok: true });
	return result;
}

/** The arguments of a package.json script that runs `motio`. */
function scriptArgs(pkg: { scripts: Record<string, string> }, name: string): string[] {
	const [binary, ...args] = (pkg.scripts[name] ?? "").split(" ");
	expect(binary).toBe("motio");
	return args;
}

async function probe(file: string) {
	const { stdout } = await run(
		ffprobe,
		[
			"-v",
			"error",
			"-count_frames",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=width,height,nb_read_frames",
			"-of",
			"json",
			file,
		],
		tmpdir(),
	);
	const stream = (JSON.parse(stdout) as { streams: Array<Record<string, unknown>> }).streams[0];
	return {
		width: stream?.width,
		height: stream?.height,
		frames: Number(stream?.nb_read_frames),
	};
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(data: Buffer): [number, number] {
	expect(data.subarray(1, 4).toString("ascii")).toBe("PNG");
	return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

let root: string;
let overrides: Record<string, string>;
const projects = new Map<string, string>();

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "motio-init-"));
	const tarballs = join(root, "tarballs");
	const packages = workspacePackages();
	const names = closure(["@motiojs/motio", "@motiojs/cli", ...STARTERS.flatMap((s) => s.packages)]);
	overrides = {};
	await Promise.all(
		names.map(async (name) => {
			const found = packages.get(name);
			if (!found) throw new Error(`${name} is not a workspace package.`);
			const packed = await run("pnpm", ["pack", "--pack-destination", tarballs], found.dir);
			expect(packed.code, packed.stderr).toBe(0);
			const file = `${name.replace(/^@/, "").replace("/", "-")}-${found.manifest.version}.tgz`;
			expect(existsSync(join(tarballs, file)), file).toBe(true);
			overrides[name] = `file:${join(tarballs, file)}`;
		}),
	);
}, 120_000);

afterAll(async () => {
	if (root) await rm(root, { recursive: true, force: true });
});

describe.each(STARTERS.map((starter) => [starter.name, starter] as const))(
	"starter %s",
	(name, starter) => {
		let dir: string;
		let pkg: { scripts: Record<string, string> };

		it("is created and installed by motio init", async () => {
			dir = join(root, name);
			// The only edit the test makes: overrides that resolve the Motio packages to the tarballs.
			// `--force` lets init write next to this file; the install is init's own.
			const workspace = [
				"preferOffline: true",
				"overrides:",
				...Object.entries(overrides).map(([n, spec]) => `  "${n}": "${spec}"`),
				"",
			].join("\n");
			await mkdir(dir, { recursive: true });
			await writeFile(join(dir, "pnpm-workspace.yaml"), workspace);

			const io = testIo(root);
			const code = await runCli(
				["init", name, "--template", name, "--pm", "pnpm", "--force", "--json"],
				io,
				defaultDeps(process.env),
			);
			const result = JSON.parse(io.out[0] as string);
			expect(validate("init", result), JSON.stringify(result)).toBeNull();
			expect(code, JSON.stringify(result)).toBe(0);
			expect(result).toMatchObject({ template: name, installed: true });
			expect(existsSync(join(dir, "node_modules/.bin/motio"))).toBe(true);
			projects.set(name, dir);
			pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
		});

		it("type-checks", async () => {
			const { code, stdout, stderr } = await run(join(dir, "node_modules/.bin/tsc"), [], dir);
			expect(code, `${stdout}\n${stderr}`).toBe(0);
		});

		it("loads its motio.config.ts through @motiojs/motio/config, as doctor reports", async () => {
			const { stdout, stderr } = await run(
				join(dir, "node_modules/.bin/motio"),
				["doctor", "--json"],
				dir,
			);
			const result = JSON.parse(stdout) as { checks: Array<Record<string, unknown>> };
			expect(
				result.checks.find((check) => check.name === "config"),
				stderr,
			).toMatchObject({
				status: "pass",
				message: "Using motio.config.ts.",
				// The child process sees the real path of the temporary folder (/private/var on macOS).
				details: { kind: "motio", file: join(realpathSync(dir), "motio.config.ts") },
			});
		});

		it("type-checks imports of assets through @motiojs/motio/client", async () => {
			// What the bundle accepts, typed by the published `@motiojs/motio/client` the starter references.
			const file = join(dir, "src/assets-check.ts");
			await writeFile(
				file,
				[
					'import font from "./font.woff2";',
					'import logo from "./logo.png";',
					'import icon from "./icon.svg";',
					'import clip from "./clip.mp4";',
					'import readme from "../README.md?raw";',
					'import url from "../README.md?url";',
					'import styles from "./card.module.css";',
					"export const all: string[] = [font, logo, icon, clip, readme, url, styles.card ?? ''];",
					"",
				].join("\n"),
			);
			try {
				const { code, stdout, stderr } = await run(join(dir, "node_modules/.bin/tsc"), [], dir);
				expect(code, `${stdout}\n${stderr}`).toBe(0);
			} finally {
				await rm(file);
			}
		});

		it("renders its still and its video with the expected size and frame count", async () => {
			const listed = await motio(dir, ["compositions", "src/index.ts"], "compositions");
			const compositions = listed.compositions as Array<{
				id: string;
				width: number;
				height: number;
				durationInFrames: number;
			}>;
			const video = compositions.find((c) => c.id === starter.render.composition);
			const stillComposition = compositions.find((c) => c.id === starter.still.composition);
			expect(video && stillComposition, JSON.stringify(compositions)).toBeTruthy();
			if (!video || !stillComposition) return;

			await motio(dir, scriptArgs(pkg, "still"), "still");
			const png = await readFile(join(dir, starter.still.output));
			expect(pngSize(png)).toEqual([stillComposition.width, stillComposition.height]);

			await motio(dir, scriptArgs(pkg, "render"), "render");
			expect(await probe(join(dir, starter.render.output))).toEqual({
				width: video.width,
				height: video.height,
				frames: video.durationInFrames,
			});
		});

		it("renders every frame the same in any order and on any number of tabs", async () => {
			const result = await motio(
				dir,
				["check", "determinism", "src/index.ts", starter.render.composition, "--frames=0-"],
				"check-determinism",
			);
			expect(result.mismatches).toEqual([]);
			expect(result.deterministic).toBe(true);
		});
	},
);

describe("motio dev on a generated project", () => {
	it("serves the preview page with every composition of the basic starter", async () => {
		const dir = projects.get("basic");
		expect(dir, "the basic starter was not installed").toBeDefined();
		if (!dir) return;
		const child = spawn(join(dir, "node_modules/.bin/motio"), ["dev", "src/index.ts", "--json"], {
			cwd: dir,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stderr = "";
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		const exited = new Promise<number | null>((resolve) => child.on("close", resolve));
		const browser = await puppeteer.launch({
			executablePath: (await ensureBrowser()).executablePath,
			headless: true,
			args: testChromeArgs(),
		});
		try {
			const line = await new Promise<string>((resolve, reject) => {
				let stdout = "";
				child.stdout.on("data", (chunk: Buffer) => {
					stdout += chunk.toString();
					if (stdout.includes("\n")) resolve(stdout.split("\n")[0] as string);
				});
				child.on("close", () => reject(new Error(`motio dev exited: ${stderr}`)));
			});
			const result = JSON.parse(line);
			expect(validate("dev", result), line).toBeNull();
			const page = await browser.newPage();
			const errors: string[] = [];
			page.on("pageerror", (error) => errors.push(String(error)));
			await page.goto(result.url);
			await page.waitForSelector("[data-composition-id=Thumbnail]");
			const ids = await page.$$eval("[data-composition-id]", (items) =>
				items.map((item) => item.getAttribute("data-composition-id")),
			);
			expect(ids.sort()).toEqual(["Intro", "Thumbnail"]);
			await page.click("[data-composition-id=Intro]");
			await page.waitForSelector("[data-testid=stage]");
			expect(await page.$eval("[data-testid=composition-meta]", (e) => e.textContent)).toBe(
				"1280×720 · 30 fps · 120 frames (4.00 s)",
			);
			expect(errors).toEqual([]);
			// Packages ship dist/ only, so their source maps must carry the sources (inlineSources).
			expect(stderr).not.toContain("points to missing source files");
		} finally {
			await browser.close();
			child.kill("SIGINT");
			expect(await exited, stderr).toBe(0);
		}
	});
});
