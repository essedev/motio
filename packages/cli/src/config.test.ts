import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toConfigValues } from "./config.js";
import { runCli } from "./main.js";
import type { ResolveFfmpegOptions } from "./renderer-api.js";
import { fakeBundler, fakeRenderer, testDeps, testIo, validator } from "./test-support/fakes.js";

const validate = validator();
let cwd: string;
beforeEach(async () => {
	cwd = await mkdtemp(join(tmpdir(), "motio-cli-config-"));
	await writeFile(join(cwd, "package.json"), '{ "name": "project" }\n');
});
afterEach(() => rm(cwd, { recursive: true, force: true }));

/** Runs the CLI in `cwd` with extra environment variables; records the FFmpeg options asked for. */
async function run(argv: string[], env: Record<string, string> = {}) {
	const io = { ...testIo(cwd), env: { ...env } };
	const { renderer, calls } = fakeRenderer();
	const { bundler } = fakeBundler();
	const createBundle = bundler.createBundle;
	const bundleOptions: Array<Record<string, unknown>> = [];
	bundler.createBundle = async (options) => {
		bundleOptions.push(options as unknown as Record<string, unknown>);
		return createBundle(options);
	};
	const ffmpegOptions: ResolveFfmpegOptions[] = [];
	const code = await runCli(
		argv,
		io,
		testDeps(renderer, bundler, {
			resolveFfmpeg: async (options = {}) => {
				ffmpegOptions.push(options);
				return options.ffmpegExecutable
					? { ffmpeg: options.ffmpegExecutable, ffprobe: "ffprobe", source: "option" }
					: { ffmpeg: "ffmpeg", ffprobe: "ffprobe", source: env.MOTIO_FFMPEG ? "env" : "path" };
			},
		}),
	);
	return { io, calls, code, bundleOptions, ffmpegOptions };
}

const writeConfig = (name: string, text: string) => writeFile(join(cwd, name), text);

describe("motio.config.ts in the CLI", () => {
	it("supplies render defaults, the output folder, the Vite function and the FFmpeg", async () => {
		await writeConfig(
			"motio.config.ts",
			[
				"const crf: number = 23;",
				"export default {",
				"\toutDir: 'renders',",
				"\trender: { codec: 'vp9', crf, muted: true, overwrite: false, scale: 0.5 },",
				"\tbrowser: { timeoutMs: 9000, chromiumOptions: { gl: 'swiftshader', darkMode: true } },",
				"\tffmpeg: { executable: '/opt/ffmpeg/bin/ffmpeg' },",
				"\tvite: (config) => config,",
				"};",
			].join("\n"),
		);
		const { io, calls, code, bundleOptions, ffmpegOptions } = await run([
			"render",
			"Main",
			"--json",
		]);
		expect(code).toBe(0);
		const result = JSON.parse(io.out[0] as string);
		expect(validate("render", result)).toBeNull();
		expect(result.output).toBe(join(cwd, "renders", "Main.webm"));
		expect(result.ffmpeg).toMatchObject({ path: "/opt/ffmpeg/bin/ffmpeg", source: "option" });
		expect(calls.renderMedia?.[0]).toMatchObject({
			codec: "vp9",
			crf: 23,
			muted: true,
			overwrite: false,
			scale: 0.5,
			timeoutInMilliseconds: 9000,
			chromiumOptions: { gl: "swiftshader", darkMode: true },
		});
		expect(typeof bundleOptions[0]?.viteOverride).toBe("function");
		expect(ffmpegOptions[0]).toMatchObject({ ffmpegExecutable: "/opt/ffmpeg/bin/ffmpeg" });
		// The Remotion config's warnings of the fake bundler are not printed: it was never read.
		expect(result.warnings).toEqual([]);
	});

	it("lets flags beat MOTIO_ variables, and variables beat the file", async () => {
		await writeConfig(
			"motio.config.mjs",
			"export default { render: { concurrency: 2 }, browser: { timeoutMs: 1000 }, ffmpeg: { executable: '/file/ffmpeg' } };\n",
		);
		const env = { MOTIO_CONCURRENCY: "3", MOTIO_TIMEOUT: "2000", MOTIO_FFMPEG: "/env/ffmpeg" };
		const fromEnv = await run(["render", "Main", "--json"], env);
		expect(fromEnv.code).toBe(0);
		expect(fromEnv.calls.renderMedia?.[0]).toMatchObject({
			concurrency: 3,
			timeoutInMilliseconds: 2000,
		});
		// MOTIO_FFMPEG wins: the file's executable is not passed, the renderer reads the variable.
		expect(fromEnv.ffmpegOptions[0]?.ffmpegExecutable).toBeUndefined();
		const fromFlags = await run(["render", "Main", "--concurrency=4", "--timeout=3000"], env);
		expect(fromFlags.calls.renderMedia?.[0]).toMatchObject({
			concurrency: 4,
			timeoutInMilliseconds: 3000,
		});
		const fromFile = await run(["render", "Main"]);
		expect(fromFile.calls.renderMedia?.[0]).toMatchObject({
			concurrency: 2,
			timeoutInMilliseconds: 1000,
		});
	});

	it("takes render.timeModel from the file, and --time-model wins", async () => {
		await writeConfig("motio.config.mjs", "export default { render: { timeModel: 'virtual' } };\n");
		const fromFile = await run(["render", "Main"]);
		expect(fromFile.code).toBe(0);
		expect(fromFile.calls.renderMedia?.[0]).toMatchObject({ timeModel: "virtual" });
		const fromFlag = await run(["render", "Main", "--time-model=frame"]);
		expect(fromFlag.calls.renderMedia?.[0]).toMatchObject({ timeModel: "frame" });
	});

	it("passes browser.captureMethod and browser.pagesPerBrowser, and the flags win", async () => {
		await writeConfig(
			"motio.config.mjs",
			"export default { browser: { captureMethod: 'screenshot', pagesPerBrowser: 3 } };\n",
		);
		const fromFile = await run(["render", "Main"]);
		expect(fromFile.code).toBe(0);
		expect(fromFile.calls.renderMedia?.[0]).toMatchObject({
			captureMethod: "screenshot",
			pagesPerBrowser: 3,
		});
		const fromEnv = await run(["render", "Main"], { MOTIO_PAGES_PER_BROWSER: "2" });
		expect(fromEnv.calls.renderMedia?.[0]).toMatchObject({ pagesPerBrowser: 2 });
		const fromFlags = await run([
			"render",
			"Main",
			"--pages-per-browser=1",
			"--capture-method=auto",
		]);
		expect(fromFlags.calls.renderMedia?.[0]).toMatchObject({
			captureMethod: "auto",
			pagesPerBrowser: 1,
		});
	});

	it("gives still its own group", async () => {
		await writeConfig(
			"motio.config.mjs",
			"export default { outDir: 'shots', render: { scale: 0.5, jpegQuality: 50 }, still: { imageFormat: 'jpeg', scale: 2, jpegQuality: 90 } };\n",
		);
		const { io, calls, code } = await run(["still", "Main", "--json"]);
		expect(code).toBe(0);
		expect(JSON.parse(io.out[0] as string).output).toBe(join(cwd, "shots", "Main.jpeg"));
		expect(calls.renderStill?.[0]).toMatchObject({
			imageFormat: "jpeg",
			scale: 2,
			jpegQuality: 90,
		});
	});

	it("wins over remotion.config.ts with a warning naming the ignored file", async () => {
		await writeConfig("motio.config.mjs", "export default { render: { codec: 'h265' } };\n");
		await writeConfig("remotion.config.ts", "throw new Error('not loaded');\n");
		const { io, calls, code } = await run(["render", "Main", "--json"]);
		expect(code).toBe(0);
		expect(JSON.parse(io.out[0] as string).warnings).toEqual([
			"Using motio.config.mjs; remotion.config.ts is ignored. Move its settings to the Motio config and delete it.",
		]);
		expect(calls.renderMedia?.[0]).toMatchObject({ codec: "h265" });
	});

	it("reads --config by any name, and a remotion.config.* name as a Remotion config", async () => {
		await mkdir(join(cwd, "config"));
		await writeConfig("config/video.mjs", "export default { render: { crf: 30 } };\n");
		const motio = await run(["render", "Main", "--config=config/video.mjs"]);
		expect(motio.code).toBe(0);
		expect(motio.calls.renderMedia?.[0]).toMatchObject({ crf: 30 });
		// A Remotion name goes to the Remotion loader (the fake one, which warns about setRspack).
		const remotion = await run(["render", "Main", "--json", "--config=remotion.config.ts"]);
		expect(JSON.parse(remotion.io.out[0] as string).warnings).toEqual([
			"Config.setRspack() has no effect.",
		]);
	});

	it("applies MOTIO_ variables over a Remotion config too", async () => {
		const { calls, code } = await run(["render", "Main"], { MOTIO_CONCURRENCY: "50%" });
		expect(code).toBe(0);
		expect(calls.renderMedia?.[0]).toMatchObject({ concurrency: "50%" });
	});

	it("fails with exit code 2 and the nearest key for an invalid config", async () => {
		await writeConfig("motio.config.mjs", "export default { render: { codex: 'h264' } };\n");
		const { io, code } = await run(["render", "Main", "--json"]);
		expect(code).toBe(2);
		const result = JSON.parse(io.out[0] as string);
		expect(result.error).toMatchObject({
			code: "E_INVALID_CONFIG",
			message: `${join(cwd, "motio.config.mjs")}: unknown key "render.codex". Did you mean "render.codec"?`,
		});
		await rm(join(cwd, "motio.config.mjs"));
		const badEnv = await run(["render", "Main"], { MOTIO_TIMEOUT: "soon" });
		expect(badEnv.code).toBe(2);
		expect(badEnv.io.err.join("")).toContain(
			'MOTIO_TIMEOUT must be an integer of at least 1; got "soon".',
		);
	});

	it("doctor reports which config file is in use", async () => {
		await writeConfig("motio.config.mjs", "export default { entryPoint: 'src/index.ts' };\n");
		await writeConfig("remotion.config.ts", "throw new Error('not loaded');\n");
		const { io, code } = await run(["doctor", "--json"]);
		const result = JSON.parse(io.out[0] as string);
		expect(validate("doctor", result)).toBeNull();
		expect(code).toBe(0);
		const check = (result.checks as Array<Record<string, unknown>>).find(
			(c) => c.name === "config",
		);
		expect(check).toMatchObject({
			status: "pass",
			message: "Using motio.config.mjs.",
			details: { file: join(cwd, "motio.config.mjs"), kind: "motio" },
		});
		expect(result.warnings).toContain(
			"Using motio.config.mjs; remotion.config.ts is ignored. Move its settings to the Motio config and delete it.",
		);
	});

	it("doctor reports an invalid config as a failed check", async () => {
		await writeConfig("motio.config.mjs", "export default { dev: { port: 'x' } };\n");
		const { io, code } = await run(["doctor", "--json"]);
		const result = JSON.parse(io.out[0] as string);
		expect(code).toBe(3);
		expect(
			(result.checks as Array<Record<string, unknown>>).find((c) => c.name === "config"),
		).toMatchObject({
			status: "fail",
			message: expect.stringContaining('dev.port must be an integer from 1 to 65535; got "x".'),
		});
	});
});

describe("toConfigValues", () => {
	it("maps every group to the values the commands read", () => {
		expect(
			toConfigValues({
				entryPoint: "src/index.ts",
				publicDir: "assets",
				envFile: ".env.video",
				logLevel: "verbose",
				tailwind: "v4",
				render: {
					codec: "prores",
					proResProfile: "4444",
					imageFormat: "png",
					preferLossless: true,
					overwrite: false,
					scale: 2,
				},
				still: { imageFormat: "webp", scale: 3 },
				browser: { executable: "/chrome", chromiumOptions: { headless: false, userAgent: "UA" } },
				dev: { port: 4000 },
			}),
		).toEqual({
			entryPoint: "src/index.ts",
			publicDir: "assets",
			dotEnvLocation: ".env.video",
			logLevel: "verbose",
			tailwind: "v4",
			codec: "prores",
			proResProfile: "4444",
			videoImageFormat: "png",
			stillImageFormat: "webp",
			preferLosslessAudio: true,
			overwriteOutput: false,
			scale: 2,
			browserExecutable: "/chrome",
			chromiumHeadlessMode: false,
			chromiumUserAgent: "UA",
			studioPort: 4000,
		});
		expect(toConfigValues({ render: { scale: 2 }, still: { scale: 3 } }, "still").scale).toBe(3);
	});
});
