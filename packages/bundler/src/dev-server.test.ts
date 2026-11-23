import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
	type DevServer,
	type DevServerOptions,
	parseStillRequest,
	startDevServer,
	stillRequestRefusal,
} from "./dev-server.js";
import { listStaticFiles } from "./static-files.js";

const fixtures = fileURLToPath(new URL("../test-fixtures/", import.meta.url));

let project: string;
const servers: DevServer[] = [];

beforeAll(async () => {
	// The watcher reports real paths; macOS's tmpdir is behind a symlink.
	project = await realpath(await mkdtemp(join(tmpdir(), "motio-dev-server-")));
	await mkdir(join(project, "src"), { recursive: true });
	await mkdir(join(project, "public", "data"), { recursive: true });
	await writeFile(
		join(project, "src", "index.ts"),
		'import { registerRoot } from "remotion";\nregisterRoot(() => null);\n',
	);
	await writeFile(join(project, "public", "data", "a b#c.txt"), "x");
	await writeFile(join(project, "public", "logo.svg"), "<svg/>");
});
afterEach(async () => {
	await Promise.all(servers.splice(0).map((server) => server.close()));
});
afterAll(() => rm(project, { recursive: true, force: true }));

/** Starts a server on the temporary project, without dependency pre-bundling. */
async function start(options: Partial<DevServerOptions> = {}): Promise<DevServer> {
	const server = await startDevServer({
		entryPoint: "",
		rootDir: project,
		envVariables: { REMOTION_GREETING: "</script><b>hi" },
		port: 0,
		host: "127.0.0.1",
		viteOverride: (config) => ({
			...config,
			cacheDir: join(project, ".vite-cache"),
			optimizeDeps: { noDiscovery: true, include: [] },
		}),
		...options,
	});
	servers.push(server);
	return server;
}

async function occupyPort(): Promise<{ port: number; server: Server }> {
	const server = createServer();
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (typeof address !== "object" || !address) throw new Error("No address.");
	return { port: address.port, server };
}

describe("startDevServer", () => {
	it("serves the page with the bundle context set before any module", async () => {
		const server = await start();
		expect(server.entryPoint).toBe(join(project, "src", "index.ts"));
		expect(server.entryPointReason).toBe("common paths");
		expect(server.publicDir).toBe(join(project, "public"));
		expect(server.envVariableNames).toEqual(["REMOTION_GREETING"]);

		const response = await fetch(server.url);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toMatch(/^text\/html/);
		const html = await response.text();
		expect(html).toContain("/@vite/client");
		expect(html).toContain('<script type="module" src="/@id/__x00__virtual:motio/preview-entry">');
		// The env value cannot close the inline script.
		expect(html.match(/<\/script>/g)?.length).toBe(html.match(/<script/g)?.length);

		const context = /<script>\(function \(\) \{\n([\s\S]*?)\n\}\)\(\);<\/script>/.exec(html)?.[1];
		if (!context) throw new Error(`No context script in:\n${html}`);
		const scope: Record<string, unknown> = {};
		new Function("globalThis", context)(scope);
		expect(scope.__MOTIO_ENV__).toEqual({
			REMOTION_GREETING: "</script><b>hi",
			NODE_ENV: "development",
		});
		const bundle = scope.__motioBundle as {
			staticBase: string;
			staticFiles: Array<{ name: string; src: string }>;
		};
		expect(bundle.staticBase).toBe("/");
		expect(bundle.staticFiles.map((f) => [f.name, f.src])).toEqual([
			["data/a b#c.txt", "/data/a%20b%23c.txt"],
			["logo.svg", "/logo.svg"],
		]);

		// Public files are served from the root, where staticFile() points, with ranges.
		const file = await fetch(new URL("/data/a%20b%23c.txt", server.url));
		expect(await file.text()).toBe("x");
		const svg = await fetch(new URL("/logo.svg", server.url), { headers: { range: "bytes=1-3" } });
		expect(svg.status).toBe(206);
		expect(svg.headers.get("content-type")).toBe("image/svg+xml");
		expect(svg.headers.get("content-range")).toBe("bytes 1-3/6");
		expect(await svg.text()).toBe("svg");
		expect((await fetch(new URL("/..%2Fsrc%2Findex.ts", server.url))).status).toBe(404);
	});

	it("generates the page module: user entry first, then the preview with its options", async () => {
		const server = await start({ initialProps: { title: "cli" }, keyboardShortcuts: false });
		const response = await fetch(new URL("/@id/__x00__virtual:motio/preview-entry", server.url));
		expect(response.status).toBe(200);
		const code = await response.text();
		const entryAt = code.indexOf("/src/index.ts");
		const previewAt = code.indexOf("mountPreview");
		expect(entryAt).toBeGreaterThan(-1);
		expect(previewAt).toBeGreaterThan(entryAt);
		expect(code).toContain(
			'mountPreview({"stillEndpoint":null,"initialProps":{"title":"cli"},"keyboardShortcuts":false})',
		);
	});

	it("renders stills through the handler and serves the image", async () => {
		const image = join(project, "still.png");
		await writeFile(image, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
		const handler = vi.fn(async () => ({
			file: image,
			frame: 7,
			width: 320,
			height: 180,
			durationMs: 12,
		}));
		const server = await start({ onRenderStill: handler });
		const still = (body: unknown) =>
			fetch(new URL("/__motio/still", server.url), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});

		const page = await (
			await fetch(new URL("/@id/__x00__virtual:motio/preview-entry", server.url))
		).text();
		expect(page).toContain('"stillEndpoint":"/__motio/still"');

		const ok = await still({ compositionId: "Hello", frame: 7, inputProps: { a: 1 } });
		expect(ok.status).toBe(200);
		const result = (await ok.json()) as Record<string, unknown>;
		expect(result).toMatchObject({ ok: true, file: image, frame: 7, width: 320, height: 180 });
		expect(handler).toHaveBeenCalledWith(
			{ compositionId: "Hello", frame: 7, inputProps: { a: 1 } },
			expect.any(AbortSignal),
		);
		const served = await fetch(new URL(result.url as string, server.url));
		expect(served.headers.get("content-type")).toBe("image/png");
		expect(Buffer.from(await served.arrayBuffer())).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

		const invalid = await still({ compositionId: "Hello", frame: -1, inputProps: {} });
		expect(invalid.status).toBe(400);
		expect(await invalid.json()).toMatchObject({
			ok: false,
			error: { code: "E_INVALID_ARGUMENT" },
		});

		handler.mockRejectedValueOnce(
			Object.assign(new Error("\u001b[31mboom\u001b[39m"), { code: "E_RENDER_ERROR" }),
		);
		const failed = await still({ compositionId: "Hello", frame: 1, inputProps: {} });
		expect(failed.status).toBe(500);
		expect(await failed.json()).toEqual({
			ok: false,
			error: { code: "E_RENDER_ERROR", message: "boom" },
		});

		expect((await fetch(new URL("/__motio/stills/unknown.png", server.url))).status).toBe(404);
	});

	it("refuses render requests from other sites and bodies that are not JSON", async () => {
		const handler = vi.fn(async () => ({
			file: join(project, "never.png"),
			frame: 0,
			width: 1,
			height: 1,
			durationMs: 1,
		}));
		const server = await start({ onRenderStill: handler });
		const body = JSON.stringify({ compositionId: "Hello", frame: 0, inputProps: {} });
		const post = (headers: Record<string, string>) =>
			fetch(new URL("/__motio/still", server.url), { method: "POST", headers, body });
		const own = new URL(server.url).origin;

		// A form or fetch from another site needs no preflight with text/plain.
		const crossText = await post({ "content-type": "text/plain", origin: "https://evil.example" });
		expect(crossText.status).toBe(403);
		const crossJson = await post({
			"content-type": "application/json",
			origin: "https://evil.example",
		});
		expect(crossJson.status).toBe(403);
		// DNS rebinding: Origin and Host agree, but name a domain instead of this machine.
		const port = new URL(server.url).port;
		const rebound = await post({
			"content-type": "application/json",
			origin: `http://evil.example:${port}`,
			host: `evil.example:${port}`,
		});
		expect(rebound.status).toBe(403);
		const sameText = await post({ "content-type": "text/plain", origin: own });
		expect(sameText.status).toBe(415);
		expect(await sameText.json()).toMatchObject({ error: { code: "E_INVALID_ARGUMENT" } });
		expect(handler).not.toHaveBeenCalled();

		await writeFile(join(project, "never.png"), Buffer.from([0x89]));
		const same = await post({ "content-type": "application/json; charset=utf-8", origin: own });
		expect(same.status).toBe(200);
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("answers 404 to render requests when no handler is set", async () => {
		const server = await start();
		const response = await fetch(new URL("/__motio/still", server.url), {
			method: "POST",
			body: JSON.stringify({ compositionId: "Hello", frame: 0, inputProps: {} }),
		});
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ error: { code: "E_NOT_AVAILABLE" } });
	});

	it("moves to a free port unless the port is strict", async () => {
		const taken = await occupyPort();
		try {
			const server = await start({ port: taken.port });
			expect(server.port).not.toBe(taken.port);
			expect(server.url).toBe(`http://127.0.0.1:${server.port}/`);
			await expect(start({ port: taken.port, strictPort: true })).rejects.toMatchObject({
				code: "E_PORT_IN_USE",
				context: { port: taken.port },
			});
		} finally {
			taken.server.close();
		}
	});

	it("reports changed files", async () => {
		const changed: string[] = [];
		await start({ onFileChange: (file) => changed.push(file) });
		const file = join(project, "src", "extra.ts");
		await new Promise((resolve) => setTimeout(resolve, 300));
		await writeFile(file, "export const x = 1;\n");
		await vi.waitFor(() => expect(changed).toContain(file), { timeout: 5000 });
	});

	it("fails on a public directory that was asked for and is missing", async () => {
		await expect(start({ publicDir: "missing" })).rejects.toMatchObject({
			code: "E_PUBLIC_DIR_NOT_FOUND",
		});
	});
});

describe("stillRequestRefusal", () => {
	const json = { "content-type": "application/json" };
	it("accepts this server's page and clients without an Origin", () => {
		for (const host of ["127.0.0.1:3000", "localhost:3000", "[::1]:3000", "192.168.1.20:3000"]) {
			expect(
				stillRequestRefusal({ headers: { ...json, host, origin: `http://${host}` } }),
			).toBeNull();
		}
		expect(stillRequestRefusal({ headers: { ...json, host: "127.0.0.1:3000" } })).toBeNull();
	});

	it("refuses other origins, rebound domains and bodies that are not JSON", () => {
		const host = "127.0.0.1:3000";
		const refused = (headers: Record<string, string>) => stillRequestRefusal({ headers })?.status;
		expect(refused({ ...json, host, origin: "https://evil.example" })).toBe(403);
		expect(refused({ ...json, host, origin: "null" })).toBe(403);
		expect(
			refused({ ...json, host: "evil.example:3000", origin: "http://evil.example:3000" }),
		).toBe(403);
		expect(refused({ "content-type": "text/plain", host, origin: `http://${host}` })).toBe(415);
		expect(refused({ host })).toBe(415);
	});
});

describe("parseStillRequest", () => {
	it("accepts a composition id, a frame and props", () => {
		expect(parseStillRequest({ compositionId: "A", frame: 0, inputProps: {} })).toEqual({
			compositionId: "A",
			frame: 0,
			inputProps: {},
		});
	});

	it.each([
		[null, "JSON object"],
		[{ compositionId: "", frame: 0, inputProps: {} }, "compositionId"],
		[{ compositionId: "A", frame: 1.5, inputProps: {} }, "frame"],
		[{ compositionId: "A", frame: 0, inputProps: [] }, "inputProps"],
		[{ compositionId: "A", frame: 0 }, "inputProps"],
	])("rejects %j", (body, field) => {
		expect(() => parseStillRequest(body)).toThrow(field);
	});
});

describe("listStaticFiles", () => {
	it("lists nested files with encoded URLs in name order", async () => {
		const files = await listStaticFiles(join(fixtures, "basic", "public"), "/static");
		expect(files.map((f) => [f.name, f.src])).toEqual([
			["data/a b#c.txt", "/static/data/a%20b%23c.txt"],
			["hello.txt", "/static/hello.txt"],
		]);
		expect(files.every((f) => f.sizeInBytes > 0 && f.lastModified > 0)).toBe(true);
	});
});
