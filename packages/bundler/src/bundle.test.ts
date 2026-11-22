import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getConfigWarnings, resetConfig } from "@motiojs/compat/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type BundleOptions, bundle, createBundle } from "./bundle.js";
import { loadRemotionConfig } from "./config-file.js";

const fixtures = fileURLToPath(new URL("../test-fixtures/", import.meta.url));
const fakeMotio = join(fixtures, "fake-motio.js");
const fakeRuntime = join(fixtures, "fake-runtime.js");

interface FakeRuntimeResult {
	html: string;
	env: Record<string, string>;
	bundle: { staticBase: string; staticFiles: Array<{ name: string; src: string }> };
}

const outDirs: string[] = [];
async function newOutDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "motio-bundle-test-"));
	outDirs.push(dir);
	return dir;
}
afterAll(async () => {
	await Promise.all(outDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

const testOptions = (
	overrides: Partial<BundleOptions> & { entryPoint: string },
): BundleOptions => ({
	runtimeModule: fakeRuntime,
	compat: { aliases: { remotion: fakeMotio }, symbols: "off" },
	minify: false,
	...overrides,
});

/** Runs the built page entry in Node, as far as a page without a DOM can go. */
async function runPage(outDir: string, runContextEnv: Record<string, string> = {}) {
	const html = await readFile(join(outDir, "index.html"), "utf8");
	const script = /<script type="module" src="\.\/([^"]+)"/.exec(html)?.[1];
	if (!script) throw new Error(`No module script in:\n${html}`);
	const scope = globalThis as Record<string, unknown>;
	scope.__motioContext = { env: runContextEnv };
	delete scope.__fakeRuntime;
	await import(`${pathToFileURL(join(outDir, script)).href}?t=${Date.now()}`);
	delete scope.__motioContext;
	return { html, result: scope.__fakeRuntime as FakeRuntimeResult };
}

describe("bundle", () => {
	const root = join(fixtures, "basic");
	let outDir: string;
	let progress: number[];
	let page: Awaited<ReturnType<typeof runPage>>;

	beforeAll(async () => {
		resetConfig();
		outDir = await newOutDir();
		progress = [];
		const serveUrl = await bundle(
			testOptions({
				entryPoint: "src/index.ts",
				rootDir: root,
				outDir,
				envVariables: { REMOTION_GREETING: "hi", FROM_DOTENV: "dot" },
				onProgress: (p) => progress.push(p),
			}),
		);
		expect(serveUrl).toBe(outDir);
		page = await runPage(outDir, { RUNTIME_ONLY: "runtime" });
	});

	it("generates an index.html loading the entry chunk and the extracted CSS", async () => {
		expect(page.html).toContain('<div id="motio-root"></div>');
		const css = /<link rel="stylesheet" href="\.\/([^"]+)"/.exec(page.html)?.[1];
		expect(css).toBeDefined();
		const styles = await readFile(join(outDir, css as string), "utf8");
		expect(styles).toMatch(/rgb\(1,\s*2,\s*3\)|#010203/);
		expect(styles).toMatch(/rgb\(4,\s*5,\s*6\)|#040506/);
	});

	it("runs the user entry, then mountPage from the runtime, with JSX and asset imports", () => {
		const { html } = page.result;
		expect(html).toMatch(/class="_card_[\w-]+"/);
		expect(html).toMatch(/src="data:image\/svg\+xml|src="[^"]*logo[^"]*\.svg"/);
		expect(html).toMatch(/src="data:image\/png|src="[^"]*pixel[^"]*\.png"/);
	});

	it("exposes env variables through process.env, runtime ones winning", () => {
		expect(page.result.html).toContain('data-greeting="hi"');
		expect(page.result.html).toContain('data-dotenv="dot"');
		expect(page.result.env).toEqual({
			REMOTION_GREETING: "hi",
			FROM_DOTENV: "dot",
			RUNTIME_ONLY: "runtime",
			NODE_ENV: "production",
		});
	});

	it("copies public/ and resolves staticFile() with Remotion's encoding", async () => {
		expect(await readFile(join(outDir, "public", "data", "a b#c.txt"), "utf8")).toBe("encoded\n");
		expect(page.result.html).toContain("./public/data/a%20b%23c.txt");
		expect(page.result.bundle.staticFiles.map((f) => f.src)).toEqual([
			"./public/data/a%20b%23c.txt",
			"./public/hello.txt",
		]);
	});

	it("uses React's production build", async () => {
		const assets = await readdir(join(outDir, "assets"));
		const code = await Promise.all(
			assets
				.filter((f) => f.endsWith(".js"))
				.map((f) => readFile(join(outDir, "assets", f), "utf8")),
		);
		const all = code.join("\n");
		expect(all).toMatch(/react[\w-]*\.production/);
		expect(all).not.toContain("react-dom.development");
		expect(all).not.toContain("react-jsx-runtime.development");
	});

	it("reports monotonic progress from 0 to 100", () => {
		expect(progress[0]).toBe(0);
		expect(progress.at(-1)).toBe(100);
		expect([...progress].sort((a, b) => a - b)).toEqual(progress);
	});

	it("supports the legacy positional form", async () => {
		const dir = await newOutDir();
		const result = await bundle(join(root, "src/index.ts"), undefined, {
			...testOptions({ entryPoint: "" }),
			rootDir: root,
			outDir: dir,
			envVariables: {},
		});
		expect(existsSync(join(result, "index.html"))).toBe(true);
	});
});

describe("bundle with remotion.config.ts", () => {
	const root = join(fixtures, "with-config");

	beforeEach(() => resetConfig());

	it("loads the config file through the @remotion/cli/config alias", async () => {
		const loaded = await loadRemotionConfig({ rootDir: root });
		expect(loaded.file).toBe(join(root, "remotion.config.ts"));
		expect(loaded.values).toMatchObject({
			entryPoint: "./app/entry.tsx",
			publicDir: "./assets-public",
			dotEnvLocation: "fixture.env",
			videoImageFormat: "png",
			concurrency: 2,
		});
		expect(loaded.warnings.map((w) => w.setter)).toEqual([
			"setKeyboardShortcutsEnabled",
			"overrideWebpackConfig",
		]);
		expect(loaded.warnings[1]?.message).toMatch(
			/changes the webpack configuration.*D-003.*Vite plugin/s,
		);
		expect(getConfigWarnings()).toHaveLength(2);
	});

	it("takes the entry point, public dir and env file from the config, and aliases @remotion/cli/config in user code", async () => {
		const loaded = await loadRemotionConfig({ rootDir: root });
		const outDir = await newOutDir();
		const warnings: string[] = [];
		const result = await createBundle({
			...testOptions({ entryPoint: "" }),
			rootDir: root,
			outDir,
			config: loaded.values,
			onWarning: (w) => warnings.push(w),
		});
		expect(result.entryPoint).toBe(join(root, "app", "entry.tsx"));
		expect(result.entryPointReason).toBe("config");
		expect(result.staticFiles.map((f) => f.name)).toEqual(["x.txt"]);
		expect(result.envVariableNames).toContain("FROM_DOTENV");
		const { result: page } = await runPage(outDir);
		expect(page.html).toContain('data-config="true"');
		expect(page.html).toContain('data-dotenv="from-config-env-file"');
	});
});

describe("bundle errors", () => {
	const root = join(fixtures, "basic");

	it("rejects webpackOverride with a pointer to Vite", async () => {
		await expect(
			bundle({
				entryPoint: "src/index.ts",
				rootDir: root,
				// biome-ignore lint/suspicious/noExplicitAny: the option is typed `never` on purpose
				webpackOverride: ((c: unknown) => c) as any,
			}),
		).rejects.toMatchObject({
			code: "E_WEBPACK_OVERRIDE",
			message: expect.stringMatching(/viteOverride/),
		});
	});

	it("refuses an output directory that contains the project", async () => {
		await expect(
			bundle(testOptions({ entryPoint: "src/index.ts", rootDir: root, outDir: fixtures })),
		).rejects.toMatchObject({ code: "E_UNSAFE_OUT_DIR" });
	});

	it("requires registerRoot in the entry unless told otherwise", async () => {
		await expect(
			bundle(testOptions({ entryPoint: "src/Root.tsx", rootDir: root, outDir: await newOutDir() })),
		).rejects.toMatchObject({ code: "E_NO_REGISTER_ROOT" });
	});

	it("wraps build failures with E_BUNDLE", async () => {
		await expect(
			bundle({
				...testOptions({ entryPoint: "src/index.ts" }),
				rootDir: root,
				outDir: await newOutDir(),
				envVariables: {},
				compat: { symbols: "off", aliases: { remotion: join(fixtures, "does-not-exist.js") } },
			}),
		).rejects.toMatchObject({ code: "E_BUNDLE" });
	});
});

describe("bundle with Tailwind", () => {
	it("replaces enableTailwind from @remotion/tailwind-v4 with @tailwindcss/vite", async () => {
		const root = join(fixtures, "tailwind-v4");
		const loaded = await loadRemotionConfig({ rootDir: root });
		expect(loaded.warnings).toEqual([]);
		const outDir = await newOutDir();
		const result = await createBundle({
			...testOptions({ entryPoint: "src/index.tsx" }),
			rootDir: root,
			outDir,
			config: loaded.values,
			envVariables: {},
		});
		expect(result.tailwind).toBe("v4");
		const html = await readFile(join(outDir, "index.html"), "utf8");
		const css = /<link rel="stylesheet" href="\.\/([^"]+)"/.exec(html)?.[1] as string;
		const styles = await readFile(join(outDir, css), "utf8");
		expect(styles).toContain(".bg-red-500");
		expect(styles).toContain(".p-4");
	});
});
