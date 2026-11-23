import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import type { BundleResult, DevServer, DevServerOptions } from "@motiojs/bundler";
import type { CompatibilityReport } from "@motiojs/compat";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { BundlerApi, CliDeps } from "../context.js";
import type { CliIo } from "../io.js";
import type { RendererApi, VideoConfig } from "../renderer-api.js";

/** Encodes an RGBA image as PNG (filter 0, colour type 6), for fake renderer output. */
export function encodePng(
	width: number,
	height: number,
	pixel: (x: number, y: number) => number[],
): Buffer {
	const raw = Buffer.alloc((width * 4 + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (width * 4 + 1)] = 0;
		for (let x = 0; x < width; x++) {
			const [r = 0, g = 0, b = 0, a = 255] = pixel(x, y);
			raw.set([r, g, b, a], y * (width * 4 + 1) + 1 + x * 4);
		}
	}
	const chunk = (type: string, data: Buffer) => {
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(body));
		return Buffer.concat([length, body, crc]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header.set([8, 6, 0, 0, 0], 8);
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(raw)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

export const COMPOSITION: VideoConfig = {
	id: "Main",
	width: 16,
	height: 8,
	fps: 30,
	durationInFrames: 20,
	defaultProps: { title: "hello" },
	props: { title: "hello" },
	defaultCodec: null,
	defaultOutName: null,
};

export interface RendererCalls {
	[method: string]: Array<Record<string, unknown>>;
}

/** A renderer that records its calls and draws one flat grey level per frame. */
export function fakeRenderer(
	options: {
		compositions?: VideoConfig[];
		/** Grey level of a frame; `run` counts renderFrames calls. */
		level?: (frame: number, run: number) => number;
	} = {},
): { renderer: RendererApi; calls: RendererCalls } {
	const compositions = options.compositions ?? [COMPOSITION];
	const level = options.level ?? ((frame: number) => frame * 10);
	const calls: RendererCalls = {};
	const record = (method: string, args: unknown) => {
		calls[method] ??= [];
		(calls[method] as Array<Record<string, unknown>>).push(args as Record<string, unknown>);
	};
	let runs = 0;
	const find = (id: string) => {
		const found = compositions.find((c) => c.id === id);
		if (!found) {
			throw Object.assign(new Error(`No composition with the id ${id}.`), {
				code: "E_COMPOSITION_NOT_FOUND",
				composition: id,
			});
		}
		return found;
	};
	const renderer: RendererApi = {
		async getCompositions(o) {
			record("getCompositions", o);
			return compositions;
		},
		async selectComposition(o) {
			record("selectComposition", o);
			return find(o.id);
		},
		async renderMedia(o) {
			record("renderMedia", o);
			o.onProgress?.({ renderedFrames: 10, encodedFrames: 10, progress: 1 });
			return {};
		},
		async renderStill(o) {
			record("renderStill", o);
			return {};
		},
		async renderFrames(o) {
			record("renderFrames", o);
			const run = runs++;
			const frames = o.frameOrder ? o.frameOrder(o.frames ?? []) : (o.frames ?? []);
			for (const frame of frames) {
				const value = level(frame, run);
				await o.onFrameBuffer?.(
					encodePng(o.composition.width, o.composition.height, () => [value, value, value, 255]),
					frame,
				);
			}
			return { frameCount: frames.length };
		},
		async ensureBrowser(o) {
			record("ensureBrowser", o ?? {});
			o?.onProgress?.({ downloadedBytes: 5, totalBytes: 10 });
			return { executablePath: "/cache/chrome", version: "158.0.8127.36", downloaded: true };
		},
		makeCancelSignal() {
			return { cancelSignal: { fake: true }, cancel: () => record("cancel", {}) };
		},
		CHROME_VERSION: "158.0.8127.36",
		defaultBrowserCacheDir: () => join(tmpdir(), "motio-no-browser-cache"),
	};
	return { renderer, calls };
}

/** A bundler that never runs Vite. */
export function fakeBundler(overrides: Partial<BundlerApi> = {}): {
	bundler: BundlerApi;
	bundles: string[];
} {
	const bundles: string[] = [];
	const bundler: BundlerApi = {
		createBundle: async (options) => {
			const serveUrl = mkdtempSync(join(tmpdir(), "motio-fake-bundle-"));
			bundles.push(serveUrl);
			options.onProgress?.(100);
			return {
				serveUrl,
				entryPoint: "/project/src/index.ts",
				entryPointReason: "common paths",
				publicDir: null,
				staticFiles: [],
				envVariableNames: [],
				tailwind: null,
				warnings: [],
			} satisfies BundleResult;
		},
		loadRemotionConfig: async () => ({
			file: null,
			values: {},
			warnings: [
				{
					setter: "setRspack",
					reason: "no-equivalent",
					message: "Config.setRspack() has no effect.",
				},
			],
		}),
		loadEnvVariables: () => ({ variables: { REMOTION_X: "1" }, file: null }),
		resolveEntryPoint: () => ({ path: "/project/src/index.ts", reason: "common paths" }),
		startDevServer: async (options) => fakeDevServer(options),
		...overrides,
	};
	return { bundler, bundles };
}

/** Dev servers started by {@link fakeBundler}, newest last. */
export const devServers: Array<{ options: DevServerOptions; closed: boolean }> = [];

function fakeDevServer(options: DevServerOptions): DevServer {
	const record = { options, closed: false };
	devServers.push(record);
	const port = options.port ?? 3000;
	return {
		url: `http://localhost:${port}/`,
		port,
		entryPoint: "/project/src/index.ts",
		entryPointReason: "common paths",
		publicDir: null,
		envVariableNames: Object.keys(options.envVariables ?? {}),
		vite: {} as DevServer["vite"],
		close: async () => {
			record.closed = true;
		},
	};
}

const emptyReport: CompatibilityReport = {
	target: "remotion@4.0.545",
	filesScanned: 0,
	entries: [],
	summary: {
		supported: 0,
		approximated: 0,
		stubbed: 0,
		missing: 0,
		"unknown-symbol": 0,
		"unsupported-package": 0,
		"unknown-package": 0,
		opaque: 0,
	},
	parseErrors: [],
	ok: true,
};

export interface TestIo extends CliIo {
	out: string[];
	err: string[];
}

export function testIo(cwd: string): TestIo {
	const out: string[] = [];
	const err: string[] = [];
	return {
		out,
		err,
		stdout: (text) => void out.push(text),
		stderr: (text) => void err.push(text),
		cwd,
		env: { REMOTION_SHELL: "1" },
		isTTY: false,
	};
}

export function testDeps(
	renderer: RendererApi,
	bundler: BundlerApi,
	overrides: Partial<CliDeps> = {},
): CliDeps {
	return {
		renderer: async () => renderer,
		bundler,
		compatibilityReport: async () => emptyReport,
		ffmpegPath: process.env.MOTIO_FFMPEG ?? "ffmpeg",
		onInterrupt: () => () => {},
		...overrides,
	};
}

const schemaDirectory = new URL("../../schemas/", import.meta.url);

/** Validates a JSON result against the published schema of its command. */
export function validator(): (name: string, value: unknown) => string | null {
	const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
	for (const file of readdirSync(schemaDirectory)) {
		ajv.addSchema(JSON.parse(readFileSync(new URL(file, schemaDirectory), "utf8")));
	}
	return (name, value) => {
		const validate = ajv.getSchema(`urn:motio:cli:${name}`);
		if (!validate) throw new Error(`No schema ${name}`);
		return validate(value) ? null : ajv.errorsText(validate.errors);
	};
}
