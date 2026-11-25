import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TOOL_VARIABLES } from "./env.js";
import {
	CONFIG_ENV_VARIABLES,
	configFromEnv,
	isRemotionConfigFile,
	loadConfig,
	mergeConfig,
	validateConfig,
} from "./motio-config.js";

const fixture = fileURLToPath(new URL("../test-fixtures/motio-config/", import.meta.url));

/** The error a call throws, for checking its code, message and context. */
function thrown(fn: () => unknown): { code?: string; message: string; context?: unknown } {
	try {
		fn();
	} catch (error) {
		return error as { code?: string; message: string; context?: unknown };
	}
	throw new Error("expected an error");
}

describe("validateConfig", () => {
	it("accepts every group and undefined values", () => {
		const config = {
			entryPoint: "src/index.ts",
			render: { codec: "h264", crf: 18, concurrency: "50%", imageFormat: "jpeg", muted: false },
			still: { imageFormat: "png", scale: 1 },
			browser: { timeoutMs: 30_000, chromiumOptions: { gl: "swiftshader" } },
			ffmpeg: { executable: undefined },
			dev: { port: 3000, open: true },
			vite: (c: unknown) => c,
		};
		expect(validateConfig(config)).toBe(config);
	});

	it("names the nearest key for an unknown one, also across groups", () => {
		expect(thrown(() => validateConfig({ render: { codex: "h264" } }))).toMatchObject({
			code: "E_INVALID_CONFIG",
			message: 'motio.config.ts: unknown key "render.codex". Did you mean "render.codec"?',
		});
		expect(thrown(() => validateConfig({ crf: 18 })).message).toBe(
			'motio.config.ts: unknown key "crf". Did you mean "render.crf"?',
		);
		expect(thrown(() => validateConfig({ publicDri: "assets" })).message).toBe(
			'motio.config.ts: unknown key "publicDri". Did you mean "publicDir"?',
		);
		expect(thrown(() => validateConfig({ zzzzzz: 1 })).message).toBe(
			'motio.config.ts: unknown key "zzzzzz".',
		);
	});

	it("says what a value must be, with the nearest choice for a typo", () => {
		expect(
			thrown(() => validateConfig({ render: { codec: "vp99" } }, "/p/motio.config.ts")).message,
		).toBe(
			'/p/motio.config.ts: render.codec must be one of h264, h265, vp8, vp9, av1, prores, mp3, aac, wav, h264-mkv, h264-ts, gif; got "vp99". Did you mean "vp9"?',
		);
		expect(thrown(() => validateConfig({ render: { crf: -1 } })).message).toBe(
			"motio.config.ts: render.crf must be an integer of at least 0; got -1.",
		);
		expect(thrown(() => validateConfig({ render: { concurrency: "half" } })).message).toContain(
			'render.concurrency must be a positive integer or a percentage such as "50%"',
		);
		expect(thrown(() => validateConfig({ still: { scale: 20 } })).message).toContain(
			"still.scale must be a number above 0 and at most 16; got 20.",
		);
		expect(thrown(() => validateConfig({ dev: { port: 70_000 } })).message).toContain(
			"dev.port must be an integer from 1 to 65535",
		);
		expect(thrown(() => validateConfig({ render: "h264" })).message).toContain(
			'render must be an object; got "h264".',
		);
		expect(
			thrown(() => validateConfig({ browser: { timeZone: "Europe/Milano" } })).message,
		).toContain(
			'browser.timeZone must be an IANA time zone name such as "UTC" or "Europe/Rome"; got "Europe/Milano".',
		);
		expect(() => validateConfig({ browser: { timeZone: "Asia/Tokyo" } })).not.toThrow();
	});

	it("reports every problem at once", () => {
		const error = thrown(() =>
			validateConfig({ render: { crf: "18", codex: "h264" }, browser: { timeout: 1 } }),
		);
		expect(error.message).toBe(
			[
				"motio.config.ts has 3 problems:",
				'  render.crf must be an integer of at least 0; got "18".',
				'  unknown key "render.codex". Did you mean "render.codec"?',
				'  unknown key "browser.timeout". Did you mean "browser.timeoutMs"?',
			].join("\n"),
		);
		expect((error.context as { problems: unknown[] }).problems).toHaveLength(3);
	});

	it("rejects a default export that is not an object", () => {
		expect(thrown(() => validateConfig(() => ({}))).message).toContain(
			"motio.config.ts must export an object as default",
		);
	});
});

describe("configFromEnv", () => {
	it("maps the MOTIO_ variables to their keys, parsing numbers", () => {
		expect(
			configFromEnv({
				MOTIO_CONCURRENCY: "4",
				MOTIO_TIMEOUT: "60000",
				MOTIO_GL: "swiftshader",
				MOTIO_FFMPEG: "/opt/ffmpeg",
				MOTIO_LOG: "",
				PATH: "/bin",
			}),
		).toEqual({
			render: { concurrency: 4 },
			browser: { timeoutMs: 60_000, chromiumOptions: { gl: "swiftshader" } },
			ffmpeg: { executable: "/opt/ffmpeg" },
		});
		expect(configFromEnv({ MOTIO_CONCURRENCY: "50%" })).toEqual({
			render: { concurrency: "50%" },
		});
	});

	it("names the variable of an invalid value", () => {
		expect(
			thrown(() => configFromEnv({ MOTIO_TIMEOUT: "30s", MOTIO_GL: "swiftshadr" })),
		).toMatchObject({
			code: "E_INVALID_CONFIG",
			message: [
				'MOTIO_TIMEOUT must be an integer of at least 1; got "30s".',
				'MOTIO_GL must be one of angle, egl, swiftshader, swangle, vulkan, angle-egl; got "swiftshadr". Did you mean "swiftshader"?',
			].join("\n"),
		});
	});

	it("keeps every config variable out of the bundle", () => {
		for (const variable of CONFIG_ENV_VARIABLES) expect(TOOL_VARIABLES).toContain(variable.name);
	});
});

describe("mergeConfig", () => {
	it("merges group by group and ignores undefined overrides", () => {
		expect(
			mergeConfig(
				{ render: { codec: "h264", crf: 18 }, browser: { chromiumOptions: { darkMode: true } } },
				{ render: { crf: 20 }, browser: { chromiumOptions: { gl: "egl" } }, outDir: undefined },
			),
		).toEqual({
			render: { codec: "h264", crf: 20 },
			browser: { chromiumOptions: { darkMode: true, gl: "egl" } },
		});
	});
});

describe("loadConfig", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "motio-config-"));
	});
	afterEach(() => rm(dir, { recursive: true, force: true }));

	it("compiles a TypeScript config importing defineConfig, and names the ignored Remotion config", async () => {
		const loaded = await loadConfig({ rootDir: fixture, env: false });
		expect(loaded.file).toBe(join(fixture, "motio.config.ts"));
		expect(loaded.ignoredFile).toBe(join(fixture, "remotion.config.ts"));
		expect(loaded.config).toMatchObject({
			entryPoint: "src/index.ts",
			outDir: "renders",
			render: { codec: "h264", crf: 18, concurrency: "50%" },
			still: { imageFormat: "png", scale: 2 },
		});
		expect(await loaded.config.vite?.({ define: { A: "1" } })).toEqual({
			define: { A: "1", FIXTURE: "1" },
		});
	});

	it("gives the settings as options of bundle() and of the renderer", async () => {
		await writeFile(
			join(dir, "motio.config.mjs"),
			[
				"export default {",
				"  entryPoint: 'src/main.tsx', publicDir: 'assets', envFile: '.env.video', tailwind: 'v4',",
				"  logLevel: 'warn', vite: (c) => c,",
				"  browser: { executable: '/chrome', timeoutMs: 5000, captureMethod: 'screenshot', pagesPerBrowser: 2, chromiumOptions: { gl: 'egl' } },",
				"  ffmpeg: { executable: '/ffmpeg', ffprobeExecutable: '/ffprobe' },",
				"};",
			].join("\n"),
		);
		const loaded = await loadConfig({ rootDir: dir, env: false });
		expect(loaded.bundleOptions).toEqual({
			entryPoint: join(dir, "src/main.tsx"),
			rootDir: dir,
			publicDir: join(dir, "assets"),
			envFile: join(dir, ".env.video"),
			viteOverride: loaded.config.vite,
			config: { tailwind: "v4" },
		});
		expect(loaded.sessionOptions).toEqual({
			browserExecutable: "/chrome",
			timeoutInMilliseconds: 5000,
			captureMethod: "screenshot",
			pagesPerBrowser: 2,
			chromiumOptions: { gl: "egl" },
			logLevel: "warn",
			ffmpegExecutable: "/ffmpeg",
			ffprobeExecutable: "/ffprobe",
		});
	});

	it("looks up .mts, .js and .mjs too, in that order after .ts", async () => {
		await writeFile(join(dir, "motio.config.mjs"), "export default { outDir: 'mjs' };\n");
		expect((await loadConfig({ rootDir: dir, env: false })).config).toEqual({ outDir: "mjs" });
		await writeFile(join(dir, "motio.config.mts"), "export default { outDir: 'mts' as string };\n");
		const loaded = await loadConfig({ rootDir: dir, env: false });
		expect(loaded.file).toBe(join(dir, "motio.config.mts"));
		expect(loaded.config).toEqual({ outDir: "mts" });
		expect(loaded.ignoredFile).toBeNull();
	});

	it("applies the MOTIO_ variables over the file, and reads the environment alone without one", async () => {
		await writeFile(
			join(dir, "motio.config.js"),
			"export default { render: { concurrency: 2, codec: 'vp9' } };\n",
		);
		const loaded = await loadConfig({ rootDir: dir, env: { MOTIO_CONCURRENCY: "3" } });
		expect(loaded.config.render).toEqual({ concurrency: 3, codec: "vp9" });
		const empty = await mkdtemp(join(tmpdir(), "motio-config-"));
		try {
			expect(await loadConfig({ rootDir: empty, env: { MOTIO_LOG: "verbose" } })).toEqual({
				file: null,
				config: { logLevel: "verbose" },
				ignoredFile: null,
				bundleOptions: { entryPoint: "", rootDir: empty },
				sessionOptions: { logLevel: "verbose" },
			});
		} finally {
			await rm(empty, { recursive: true, force: true });
		}
	});

	it("loads an explicit file by any name, relative to the root", async () => {
		await writeFile(join(dir, "video.config.mjs"), "export default { publicDir: 'assets' };\n");
		const loaded = await loadConfig({ rootDir: dir, configFile: "video.config.mjs", env: false });
		expect(loaded.file).toBe(join(dir, "video.config.mjs"));
		expect(loaded.config).toEqual({ publicDir: "assets" });
	});

	it("fails with a stable code for a missing file, a missing default export and an invalid value", async () => {
		await expect(loadConfig({ rootDir: dir, configFile: "nope.ts" })).rejects.toMatchObject({
			code: "E_CONFIG_NOT_FOUND",
		});
		await writeFile(join(dir, "motio.config.mjs"), "export const config = {};\n");
		await expect(loadConfig({ rootDir: dir, env: false })).rejects.toMatchObject({
			code: "E_INVALID_CONFIG",
			message: expect.stringContaining("has no default export: write export default defineConfig"),
		});
		await writeFile(
			join(dir, "motio.config.mjs"),
			"export default { render: { codek: 'h264' } };\n",
		);
		await expect(loadConfig({ rootDir: dir, env: false })).rejects.toMatchObject({
			code: "E_INVALID_CONFIG",
			message: `${join(dir, "motio.config.mjs")}: unknown key "render.codek". Did you mean "render.codec"?`,
		});
		await writeFile(join(dir, "motio.config.mjs"), "export default {;\n");
		await expect(loadConfig({ rootDir: dir, env: false })).rejects.toMatchObject({
			code: "E_CONFIG_LOAD",
		});
	});

	it("tells Remotion config names apart", () => {
		expect(isRemotionConfigFile("/p/remotion.config.ts")).toBe(true);
		expect(isRemotionConfigFile("/p/motio.config.ts")).toBe(false);
	});
});
