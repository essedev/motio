import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";
import { dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { type MotioCompatOptions, MotioError, motioCompat } from "@motiojs/compat";
import { analyzeWebpackOverrides, type ConfigValues } from "@motiojs/compat/config";
import react from "@vitejs/plugin-react";
import {
	createServer,
	type InlineConfig,
	type Logger,
	type Plugin,
	type PluginOption,
	searchForWorkspaceRoot,
	type ViteDevServer,
} from "vite";
import { BUNDLE_GLOBAL, PROCESS_ENV_GLOBAL, type ViteOverrideFn } from "./bundle.js";
import { compatAliases } from "./compat-aliases.js";
import { type EntryPointReason, resolveEntryPoint } from "./entry-point.js";
import { loadEnvVariables } from "./env.js";
import { motioOptimizeDeps } from "./optimize-deps.js";
import { resolveOwnDependency } from "./resolve.js";
import { listStaticFiles } from "./static-files.js";
import { serveStaticFiles } from "./static-server.js";
import { tailwindSetup } from "./tailwind.js";

/** Default port of the dev server, as Remotion's Studio. */
export const DEFAULT_DEV_PORT = 3000;

/** URL prefix of the dev server's own endpoints. */
export const DEV_API_PREFIX = "/__motio";

/** Module exporting `mountPreview()`, the page the dev server shows. */
export const DEFAULT_PREVIEW_MODULE = "@motiojs/preview";

/** What the page asks for when the user clicks "Render still". */
export interface DevStillRequest {
	compositionId: string;
	/** Frame of the composition, from 0. */
	frame: number;
	/** The props shown in the Player, default props included. */
	inputProps: Record<string, unknown>;
}

/** What a render-still handler returns. */
export interface DevStillResult {
	/** Absolute path of the image written. */
	file: string;
	frame: number;
	width: number;
	height: number;
	durationMs: number;
}

/**
 * Renders one frame through the real pipeline. Supplied by the caller (the CLI), so the
 * bundler does not depend on the renderer. The signal aborts when the page gives up.
 */
export type DevStillHandler = (
	request: DevStillRequest,
	signal: AbortSignal,
) => Promise<DevStillResult>;

/** Log levels the dev server reports through `onLog`. */
export type DevLogLevel = "info" | "warn" | "error";

/** Options of {@link startDevServer}. */
export interface DevServerOptions {
	/** Path to the file that calls `registerRoot()`; empty to look it up like `bundle()`. */
	entryPoint: string;
	/** Directory with the project's `package.json`. Defaults to the current directory. */
	rootDir?: string;
	/** Values from `remotion.config.ts` (see `loadRemotionConfig`). */
	config?: Readonly<Partial<ConfigValues>>;
	/** Variables exposed as `process.env`; by default the `.env` file and `REMOTION_` variables. */
	envVariables?: Record<string, string>;
	/** Dotenv file to read instead of `.env`. */
	envFile?: string;
	/** Public directory; `public/` in `rootDir` by default, then `Config.setPublicDir()`. */
	publicDir?: string | null;
	/** Port to listen on. Default `Config.setStudioPort()`, else 3000. */
	port?: number;
	/** Fail when the port is taken instead of trying the next ones. Default false. */
	strictPort?: boolean;
	/** Host to bind. Default `localhost`. */
	host?: string;
	/** Open the page in the default browser once listening. Default false. */
	open?: boolean;
	/** Rewrites the Vite configuration before the server starts. */
	viteOverride?: ViteOverrideFn;
	/** Options of the compat plugin. */
	compat?: MotioCompatOptions;
	/** Module exporting `mountPreview()`; `@motiojs/preview` by default. */
	previewModule?: string;
	/** Props from `--props`, merged over each composition's default props in the editor. */
	initialProps?: Record<string, unknown>;
	/** Global keyboard shortcuts on the page. Default true. */
	keyboardShortcuts?: boolean;
	/** Enables "Render still" on the page. */
	onRenderStill?: DevStillHandler;
	/** Called when a watched file changes, is added or removed (absolute path). */
	onFileChange?: (file: string) => void;
	/** Server messages: info (reloads, updates), warnings, errors (failed transforms). */
	onLog?: (level: DevLogLevel, message: string) => void;
}

/** A running dev server. */
export interface DevServer {
	/** URL of the page, e.g. `http://localhost:3000/`. */
	url: string;
	port: number;
	entryPoint: string;
	entryPointReason: EntryPointReason;
	/** Public directory served, or null when the project has none. */
	publicDir: string | null;
	/** Names of the variables exposed as `process.env` (values are not echoed). */
	envVariableNames: string[];
	/** The underlying Vite server. */
	vite: ViteDevServer;
	/** Stops watching and closes the server. */
	close(): Promise<void>;
}

const ENTRY_ID = "virtual:motio/preview-entry";
const RESOLVED_ENTRY = `\0${ENTRY_ID}`;
const STILL_ENDPOINT = `${DEV_API_PREFIX}/still`;
const STILLS_PREFIX = `${DEV_API_PREFIX}/stills/`;
/** Largest render-still request body: props are JSON, a megabyte is generous. */
const MAX_BODY_BYTES = 1 << 20;
/** The public directory is served from the server root, so `staticFile()` URLs start here. */
const DEV_STATIC_BASE = "/";

const IMAGE_TYPES: Record<string, string> = {
	".png": "image/png",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".webp": "image/webp",
	".pdf": "application/pdf",
};

/** JSON safe to embed in an inline script: `<` never appears, so `</script>` cannot either. */
function inlineJson(value: unknown): string {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * The page. The bundle context (`staticFile()` base and file list, `process.env`) is set by a
 * classic inline script, which runs before every module script: dependencies that read
 * `process.env` while being evaluated find it, and the file list is fresh on every load.
 */
function pageHtml(context: { bundle: unknown; env: Record<string, string> }): string {
	const setup = [
		// Not frozen, unlike in a bundle: Vite's client assigns the `define` values onto it.
		`var env = Object.assign({}, ${inlineJson(context.env)}, { NODE_ENV: "development" });`,
		`globalThis.${BUNDLE_GLOBAL} = Object.freeze(Object.assign({}, ${inlineJson(context.bundle)}, { env: env }));`,
		`globalThis.${PROCESS_ENV_GLOBAL} = env;`,
	].join("\n");
	return [
		"<!doctype html>",
		'<html lang="en">',
		"<head>",
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		"<title>Motio</title>",
		`<script>(function () {\n${setup}\n})();</script>`,
		"</head>",
		"<body>",
		'<div id="motio-preview"></div>',
		// `/@id/__x00__` is how Vite addresses a virtual module from a URL.
		`<script type="module" src="/@id/__x00__${ENTRY_ID}"></script>`,
		"</body>",
		"</html>",
		"",
	].join("\n");
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
	const body = JSON.stringify(value);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
	});
	res.end(body);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = chunk as Buffer;
		size += buffer.length;
		if (size > MAX_BODY_BYTES) {
			throw new MotioError("E_INVALID_ARGUMENT", "The request body is larger than 1 MB.");
		}
		chunks.push(buffer);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch (error) {
		throw new MotioError(
			"E_INVALID_ARGUMENT",
			`The request body is not JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/** Host names that always mean this machine (a DNS name could be rebound to it). */
function isLocalHostname(hostname: string): boolean {
	const name = hostname.replace(/^\[|\]$/g, "").toLowerCase();
	return name === "localhost" || name.endsWith(".localhost") || isIP(name) !== 0;
}

/**
 * Why a render-still request must be refused, or null. Rendering runs Chrome and writes files,
 * so a page on another site must not trigger it: a cross-site `text/plain` POST needs no CORS
 * preflight. The body must be JSON, and a browser's `Origin` (sent on every POST) must be this
 * server's, reached by an IP address or `localhost` (DNS rebinding makes a foreign domain's
 * Origin and Host agree). Clients that send no Origin (curl, scripts) are not browsers.
 */
export function stillRequestRefusal(
	req: Pick<IncomingMessage, "headers">,
): { status: number; message: string } | null {
	const origin = req.headers.origin;
	if (origin !== undefined) {
		let parsed: URL | null = null;
		try {
			parsed = new URL(origin);
		} catch {
			parsed = null;
		}
		const host = req.headers.host;
		if (
			!parsed ||
			parsed.host !== host ||
			(parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
			!isLocalHostname(parsed.hostname)
		) {
			return { status: 403, message: "Render requests are accepted from this server's page only." };
		}
	}
	const type = (req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
	if (type !== "application/json") {
		return { status: 415, message: "The render-still request must be sent as application/json." };
	}
	return null;
}

/** Checks the body of a render-still request. */
export function parseStillRequest(body: unknown): DevStillRequest {
	const value = body as Partial<Record<string, unknown>> | null;
	if (typeof value !== "object" || value === null) {
		throw new MotioError("E_INVALID_ARGUMENT", "The render-still request must be a JSON object.");
	}
	const { compositionId, frame, inputProps } = value;
	if (typeof compositionId !== "string" || compositionId === "") {
		throw new MotioError("E_INVALID_ARGUMENT", "compositionId must be a non-empty string.");
	}
	if (typeof frame !== "number" || !Number.isInteger(frame) || frame < 0) {
		throw new MotioError("E_INVALID_ARGUMENT", "frame must be an integer of at least 0.", {
			frame,
		});
	}
	if (typeof inputProps !== "object" || inputProps === null || Array.isArray(inputProps)) {
		throw new MotioError("E_INVALID_ARGUMENT", "inputProps must be a JSON object.");
	}
	return { compositionId, frame, inputProps: inputProps as Record<string, unknown> };
}

function errorPayload(error: unknown): { code: string; message: string } {
	const code = (error as { code?: unknown } | null)?.code;
	return {
		code: typeof code === "string" && /^E_[A-Z0-9_]+$/.test(code) ? code : "E_INTERNAL",
		message: stripVTControlCharacters(error instanceof Error ? error.message : String(error)),
	};
}

interface DevPagePluginOptions {
	entryPoint: string;
	previewModule: string;
	publicDir: string | null;
	env: Record<string, string>;
	mountOptions: {
		stillEndpoint: string | null;
		initialProps: Record<string, unknown>;
		keyboardShortcuts: boolean;
	};
	onRenderStill: DevStillHandler | undefined;
	onFileChange: ((file: string) => void) | undefined;
}

/** The page, its virtual modules and the render-still endpoints. */
function devPagePlugin(options: DevPagePluginOptions): Plugin {
	const stills = new Map<string, string>();
	let stillCount = 0;

	const handleStill = async (req: IncomingMessage, res: ServerResponse) => {
		const handler = options.onRenderStill;
		if (!handler) {
			sendJson(res, 404, {
				ok: false,
				error: { code: "E_NOT_AVAILABLE", message: "Rendering stills is not enabled." },
			});
			return;
		}
		const refusal = stillRequestRefusal(req);
		if (refusal) {
			sendJson(res, refusal.status, {
				ok: false,
				error: { code: "E_INVALID_ARGUMENT", message: refusal.message },
			});
			return;
		}
		const controller = new AbortController();
		// The page aborted the request (a newer click, navigation): stop the render.
		res.on("close", () => {
			if (!res.writableFinished) controller.abort();
		});
		try {
			const request = parseStillRequest(await readJsonBody(req));
			const result = await handler(request, controller.signal);
			const name = `${++stillCount}-${encodeURIComponent(request.compositionId)}-${result.frame}${extname(result.file)}`;
			stills.set(name, result.file);
			sendJson(res, 200, { ok: true, url: `${STILLS_PREFIX}${name}`, ...result });
		} catch (error) {
			const payload = errorPayload(error);
			sendJson(res, payload.code === "E_INVALID_ARGUMENT" ? 400 : 500, {
				ok: false,
				error: payload,
			});
		}
	};

	const serveStill = async (name: string, res: ServerResponse) => {
		const file = stills.get(name);
		if (!file) {
			res.writeHead(404).end();
			return;
		}
		try {
			const data = await readFile(file);
			res.writeHead(200, {
				"content-type": IMAGE_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
				"cache-control": "no-store",
			});
			res.end(data);
		} catch {
			res.writeHead(404).end();
		}
	};

	return {
		name: "motio:dev-page",
		resolveId(id) {
			return id === ENTRY_ID ? RESOLVED_ENTRY : null;
		},
		load(id) {
			if (id === RESOLVED_ENTRY) {
				return [
					`import ${JSON.stringify(options.entryPoint)};`,
					`import { mountPreview } from ${JSON.stringify(options.previewModule)};`,
					`mountPreview(${JSON.stringify(options.mountOptions)});`,
				].join("\n");
			}
			return null;
		},
		configureServer(server) {
			const publicDir = options.publicDir;
			const onEvent = (event: "add" | "change" | "unlink") => (file: string) => {
				options.onFileChange?.(file);
				// getStaticFiles() lists the public directory: a file added or removed changes it,
				// and the list is written into the page, so reload it.
				if (publicDir && event !== "change" && file.startsWith(publicDir + sep)) {
					server.ws.send({ type: "full-reload" });
				}
			};
			server.watcher.on("add", onEvent("add"));
			server.watcher.on("change", onEvent("change"));
			server.watcher.on("unlink", onEvent("unlink"));

			server.middlewares.use((req, res, next) => {
				const url = new URL(req.url ?? "/", "http://motio.invalid");
				const path = url.pathname;
				if ((path === "/" || path === "/index.html") && req.method === "GET") {
					(publicDir ? listStaticFiles(publicDir, DEV_STATIC_BASE) : Promise.resolve([]))
						.then((staticFiles) =>
							server.transformIndexHtml(
								req.originalUrl ?? "/",
								pageHtml({
									bundle: { publicPath: "/", staticBase: DEV_STATIC_BASE, staticFiles },
									env: options.env,
								}),
							),
						)
						.then((html) => {
							res.writeHead(200, {
								"content-type": "text/html; charset=utf-8",
								"cache-control": "no-store",
							});
							res.end(html);
						})
						.catch(next);
					return;
				}
				if (path === STILL_ENDPOINT && req.method === "POST") {
					void handleStill(req, res);
					return;
				}
				if (path.startsWith(STILLS_PREFIX) && req.method === "GET") {
					void serveStill(path.slice(STILLS_PREFIX.length), res);
					return;
				}
				next();
			});
			if (publicDir) server.middlewares.use(serveStaticFiles(publicDir));
		},
	};
}

function forwardingLogger(onLog: DevServerOptions["onLog"]): Logger {
	const warned = new Set<string>();
	const loggedErrors = new WeakSet<Error>();
	const log = (level: DevLogLevel, message: string) =>
		onLog?.(level, stripVTControlCharacters(message).trim());
	return {
		info: (message) => log("info", message),
		warn: (message) => log("warn", message),
		warnOnce: (message) => {
			if (warned.has(message)) return;
			warned.add(message);
			log("warn", message);
		},
		error: (message, options) => {
			if (options?.error) loggedErrors.add(options.error as Error);
			log("error", message);
		},
		clearScreen: () => {},
		hasErrorLogged: (error) => loggedErrors.has(error as Error),
		hasWarned: false,
	};
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPortInUse(error: unknown): boolean {
	const e = error as { code?: unknown; message?: unknown } | null;
	return (
		e?.code === "EADDRINUSE" ||
		(typeof e?.message === "string" && /port \d+ is already in use/i.test(e.message))
	);
}

/**
 * Starts the Vite dev server that shows the preview page: the compositions of the project in
 * a Player, with hot reload. It uses the same settings as {@link bundle} where they apply
 * (compat alias, React deduplication, public directory, env variables, Tailwind,
 * `viteOverride`), plus React Fast Refresh. Rendering stays out of the bundler: pass
 * `onRenderStill` to enable the page's render check.
 */
export async function startDevServer(options: DevServerOptions): Promise<DevServer> {
	const config = options.config ?? {};
	const rootDir = resolve(options.rootDir ?? process.cwd());
	const entry = resolveEntryPoint({
		rootDir,
		entryPoint: options.entryPoint,
		configEntryPoint: config.entryPoint,
	});

	const publicDirSetting = options.publicDir ?? config.publicDir ?? "public";
	const publicDirPath = isAbsolute(publicDirSetting)
		? publicDirSetting
		: join(rootDir, publicDirSetting);
	if (!existsSync(publicDirPath) && (options.publicDir || config.publicDir)) {
		throw new MotioError(
			"E_PUBLIC_DIR_NOT_FOUND",
			`The public directory ${publicDirPath} does not exist.`,
			{ publicDir: publicDirPath },
		);
	}
	const publicDir = existsSync(publicDirPath) ? publicDirPath : null;

	const env =
		options.envVariables ??
		loadEnvVariables({ rootDir, envFile: options.envFile ?? config.dotEnvLocation }).variables;

	const previewModule = (() => {
		const requested = options.previewModule ?? DEFAULT_PREVIEW_MODULE;
		const path = isAbsolute(requested) ? requested : resolveOwnDependency(requested);
		if (!path) {
			throw new MotioError(
				"E_RUNTIME_NOT_FOUND",
				`Cannot resolve the preview page "${requested}".`,
				{ previewModule: requested },
			);
		}
		return path;
	})();

	const tailwindVersion =
		config.tailwind ?? (await analyzeWebpackOverrides(config.webpackOverrides ?? [])).tailwind;
	const tailwind = tailwindVersion ? await tailwindSetup(tailwindVersion, rootDir) : null;

	// Fast Refresh only for the project's own modules: the preview page and Motio's packages are
	// not edited while previewing, and their components must not become refresh boundaries.
	const projectFiles = new RegExp(`^${escapeRegExp(rootDir + sep)}.*\\.[cm]?[jt]sx?$`);
	const plugins: PluginOption[] = [
		motioCompat({ ...options.compat, aliases: { ...compatAliases(), ...options.compat?.aliases } }),
		react({ include: projectFiles }),
		devPagePlugin({
			entryPoint: entry.path,
			previewModule,
			publicDir,
			env,
			mountOptions: {
				stillEndpoint: options.onRenderStill ? STILL_ENDPOINT : null,
				initialProps: options.initialProps ?? {},
				keyboardShortcuts: options.keyboardShortcuts ?? true,
			},
			onRenderStill: options.onRenderStill,
			onFileChange: options.onFileChange,
		}),
		...(tailwind?.plugins ?? []),
	];

	const motioDeps = motioOptimizeDeps(rootDir);
	// The preview package may live outside the workspace of the project (a global install).
	const previewPackageDir = dirname(dirname(previewModule));
	let viteConfig: InlineConfig = {
		root: rootDir,
		base: "/",
		mode: "development",
		configFile: false,
		envDir: false,
		// Served by serveStaticFiles(): Vite's public middleware cannot serve names with "#".
		publicDir: false,
		appType: "custom",
		clearScreen: false,
		logLevel: "info",
		customLogger: forwardingLogger(options.onLog),
		plugins,
		resolve: { dedupe: ["react", "react-dom"] },
		define: {
			"process.env.NODE_ENV": JSON.stringify("development"),
			"process.env": PROCESS_ENV_GLOBAL,
		},
		...(tailwind?.css ? { css: tailwind.css } : {}),
		optimizeDeps: {
			entries: [entry.path],
			include: [
				"react",
				"react-dom",
				"react-dom/client",
				"react/jsx-runtime",
				"react/jsx-dev-runtime",
				...motioDeps.include,
			],
			exclude: motioDeps.exclude,
		},
		server: {
			port: options.port ?? config.studioPort ?? DEFAULT_DEV_PORT,
			strictPort: options.strictPort ?? false,
			host: options.host ?? "localhost",
			fs: { allow: [searchForWorkspaceRoot(rootDir), previewPackageDir] },
		},
	};
	if (options.viteOverride) viteConfig = await options.viteOverride(viteConfig);

	let vite: ViteDevServer;
	try {
		vite = await createServer(viteConfig);
	} catch (error) {
		throw new MotioError(
			"E_DEV_SERVER",
			`The dev server could not start: ${stripVTControlCharacters(error instanceof Error ? error.message : String(error))}`,
			{ entryPoint: entry.path },
			{ cause: error },
		);
	}
	try {
		await vite.listen();
	} catch (error) {
		await vite.close().catch(() => undefined);
		const port = viteConfig.server?.port;
		if (isPortInUse(error)) {
			throw new MotioError(
				"E_PORT_IN_USE",
				`Port ${port} is already in use. Pass another --port, or stop the process using it.`,
				{ port },
				{ cause: error },
			);
		}
		throw new MotioError(
			"E_DEV_SERVER",
			`The dev server could not listen: ${error instanceof Error ? error.message : String(error)}`,
			{ port },
			{ cause: error },
		);
	}
	const address = vite.httpServer?.address();
	const port =
		typeof address === "object" && address ? address.port : (viteConfig.server?.port ?? 0);
	const url = vite.resolvedUrls?.local[0] ?? `http://localhost:${port}/`;
	if (options.open) vite.openBrowser();

	return {
		url,
		port,
		entryPoint: entry.path,
		entryPointReason: entry.reason,
		publicDir,
		envVariableNames: Object.keys(env).sort(),
		vite,
		close: () => vite.close(),
	};
}
