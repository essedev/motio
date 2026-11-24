import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DevServerOptions } from "@motiojs/bundler";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../main.js";
import {
	COMPOSITION,
	devServers,
	fakeBundler,
	fakeRenderer,
	type TestIo,
	testDeps,
	testIo,
	validator,
} from "../test-support/fakes.js";

const validate = validator();
let cwd: string;
beforeEach(async () => {
	cwd = await mkdtemp(join(tmpdir(), "motio-cli-dev-"));
	devServers.length = 0;
});
afterEach(() => rm(cwd, { recursive: true, force: true }));

interface Started {
	io: TestIo;
	/** Resolves with the exit code once the command returned. */
	done: Promise<number>;
	/** Simulates Ctrl+C. */
	interrupt(): void;
	/** Simulates SIGTERM. */
	terminate(): void;
	renderer: ReturnType<typeof fakeRenderer>;
	bundles: string[];
}

/** Starts `motio dev` with fakes and waits until it printed its first output. */
async function start(
	argv: string[],
	bundlerOverrides: Parameters<typeof fakeBundler>[0] = {},
): Promise<Started> {
	const io = testIo(cwd);
	const renderer = fakeRenderer();
	const { bundler, bundles } = fakeBundler(bundlerOverrides);
	let interrupt = () => {};
	let terminate = () => {};
	const deps = testDeps(renderer.renderer, bundler, {
		onInterrupt: (handler) => {
			interrupt = handler;
			return () => {
				interrupt = () => {};
			};
		},
		onTerminate: (handler) => {
			terminate = handler;
			return () => {
				terminate = () => {};
			};
		},
	});
	const done = runCli(["dev", ...argv], io, deps);
	let finished = false;
	void done.then(() => {
		finished = true;
	});
	for (let i = 0; i < 200 && io.out.length === 0 && !finished; i++) {
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
	return {
		io,
		done,
		interrupt: () => interrupt(),
		terminate: () => terminate(),
		renderer,
		bundles,
	};
}

const lastServer = (): DevServerOptions => {
	const server = devServers.at(-1);
	if (!server) throw new Error("No dev server was started.");
	return server.options;
};

describe("motio dev", () => {
	it("prints one JSON object once listening, keeps running, and closes on Ctrl+C", async () => {
		const started = await start(["--json"]);
		expect(started.io.out).toHaveLength(1);
		const result = JSON.parse(started.io.out[0] as string);
		expect(validate("dev", result)).toBeNull();
		expect(result).toMatchObject({
			ok: true,
			command: "dev",
			url: "http://localhost:3000/",
			port: 3000,
			entryPointReason: "common paths",
			pid: process.pid,
		});
		expect(result.warnings).toEqual(["Config.setRspack() has no effect."]);
		expect(devServers.at(-1)?.closed).toBe(false);

		started.interrupt();
		expect(await started.done).toBe(0);
		expect(devServers.at(-1)?.closed).toBe(true);
		// Nothing after the first object: stdout stays parseable as one JSON value.
		expect(started.io.out).toHaveLength(1);
		expect(started.io.err).toEqual([]);
	});

	it("takes host, open, keyboard shortcuts, port and the Vite function from motio.config", async () => {
		await writeFile(
			join(cwd, "motio.config.mjs"),
			"export default { dev: { port: 4100, host: '0.0.0.0', open: true, keyboardShortcuts: false }, vite: (c) => c };\n",
		);
		const started = await start(["--json"]);
		expect(JSON.parse(started.io.out[0] as string).warnings).toEqual([]);
		const options = lastServer();
		expect(options).toMatchObject({ host: "0.0.0.0", open: true, keyboardShortcuts: false });
		// The config's port reaches the server as its default, which moves on when taken.
		expect(options.config?.studioPort).toBe(4100);
		expect(options.strictPort).toBeUndefined();
		expect(typeof options.viteOverride).toBe("function");
		started.interrupt();
		await started.done;
		// Flags win over the config.
		const flagged = await start(["--host=127.0.0.1", "--open=false", "--port=4200"]);
		expect(lastServer()).toMatchObject({
			host: "127.0.0.1",
			open: false,
			port: 4200,
			strictPort: true,
		});
		flagged.interrupt();
		await flagged.done;
	});

	it("also stops on a termination signal", async () => {
		const started = await start([]);
		started.terminate();
		expect(await started.done).toBe(0);
		expect(devServers.at(-1)?.closed).toBe(true);
	});

	it("prints the URL in human mode", async () => {
		const started = await start([]);
		expect(started.io.out.join("")).toBe("Motio preview: http://localhost:3000/\n");
		expect(started.io.err.join("")).toContain("Press Ctrl+C to stop.");
		started.interrupt();
		await started.done;
		expect(started.io.out.join("")).toContain("Stopped.");
	});

	it("says when the default port was taken and another one is used", async () => {
		const started = await start([], {
			startDevServer: async (options) => ({
				...(await fakeBundler().bundler.startDevServer(options)),
				port: 3001,
				url: "http://localhost:3001/",
			}),
		});
		expect(started.io.err.join("")).toContain("Port 3000 is in use; using 3001.\n");
		expect(started.io.out.join("")).toBe("Motio preview: http://localhost:3001/\n");
		// The entry point line is a diagnostic now, printed with --log=verbose only.
		expect(started.io.err.join("")).not.toContain("Entry point");
		started.interrupt();
		await started.done;
	});

	it("makes an explicit --port strict and leaves the default port to the config", async () => {
		const explicit = await start(["--port", "4123", "--host", "127.0.0.1"]);
		expect(lastServer()).toMatchObject({ port: 4123, strictPort: true, host: "127.0.0.1" });
		explicit.interrupt();
		await explicit.done;

		const fallback = await start([]);
		expect(lastServer().port).toBeUndefined();
		expect(lastServer().strictPort).toBeUndefined();
		fallback.interrupt();
		await fallback.done;
	});

	it("passes the entry point, props, public dir, env and page options to the server", async () => {
		await writeFile(join(cwd, "props.json"), JSON.stringify({ title: "from file" }));
		const started = await start([
			"src/main.tsx",
			"--props",
			"props.json",
			"--public-dir",
			"assets",
			"--disable-keyboard-shortcuts",
			"--open",
		]);
		expect(lastServer()).toMatchObject({
			entryPoint: join(cwd, "src/main.tsx"),
			rootDir: cwd,
			initialProps: { title: "from file" },
			publicDir: join(cwd, "assets"),
			envVariables: { REMOTION_X: "1" },
			keyboardShortcuts: false,
			open: true,
		});
		expect(typeof lastServer().onRenderStill).toBe("function");
		started.interrupt();
		await started.done;
	});

	it("honours Config.setStudioPort() without warning that it has no effect", async () => {
		const started = await start(["--json"], {
			loadRemotionConfig: async () => ({
				file: join(cwd, "remotion.config.ts"),
				values: { studioPort: 3456 },
				warnings: [
					{ setter: "setStudioPort", reason: "studio", message: "Config.setStudioPort() ..." },
				],
			}),
		});
		const result = JSON.parse(started.io.out[0] as string);
		expect(result.warnings).toEqual([]);
		expect(lastServer().config).toEqual({ studioPort: 3456 });
		started.interrupt();
		await started.done;
	});

	it.each([
		[["--port", "abc"], "--port must be an integer"],
		[["--port", "70000"], "--port must be an integer from 1 to 65535"],
		[["a.tsx", "b.tsx"], "Too many arguments"],
		[["http://localhost:3000"], "not a serve URL"],
		[["--props", "{nope"], "--props is not valid JSON"],
		[["--frame", "3"], "Unknown flag --frame."],
	])("rejects %j with exit code 2", async (argv, message) => {
		const started = await start([...argv, "--json"]);
		expect(await started.done).toBe(2);
		const result = JSON.parse(started.io.out[0] as string);
		expect(validate("dev", result)).toBeNull();
		expect(result.error.code).toBe("E_INVALID_ARGUMENT");
		expect(result.error.message).toContain(message);
		expect(devServers).toHaveLength(0);
	});

	it("reports a server that cannot start as an error result", async () => {
		const started = await start(["--json", "--port", "3000"], {
			startDevServer: async () => {
				throw Object.assign(new Error("Port 3000 is already in use."), {
					code: "E_PORT_IN_USE",
					context: { port: 3000 },
				});
			},
		});
		expect(await started.done).toBe(1);
		const result = JSON.parse(started.io.out[0] as string);
		expect(validate("dev", result)).toBeNull();
		expect(result.error).toMatchObject({ code: "E_PORT_IN_USE", context: { port: 3000 } });
	});

	it("lists dev in the help", async () => {
		const io = testIo(cwd);
		const { bundler } = fakeBundler();
		await runCli(["--help"], io, testDeps(fakeRenderer().renderer, bundler));
		expect(io.out.join("")).toMatch(/\n {2}dev +Start the preview page/);
	});
});

describe("motio dev render check", () => {
	const request = { compositionId: "Main", frame: 3, inputProps: { title: "edited" } };

	it("bundles once, selects with the page's props and renders the frame as PNG", async () => {
		const started = await start(["--timeout", "5000"]);
		const render = lastServer().onRenderStill;
		if (!render) throw new Error("No render-still handler.");
		const first = await render(request, new AbortController().signal);
		expect(first).toMatchObject({ frame: 3, width: COMPOSITION.width, height: COMPOSITION.height });
		expect(first.file).toMatch(/1-Main-3\.png$/);

		const calls = started.renderer.calls;
		expect(calls.selectComposition?.[0]).toMatchObject({
			id: "Main",
			inputProps: { title: "edited" },
			timeoutInMilliseconds: 5000,
		});
		expect(calls.renderStill?.[0]).toMatchObject({
			frame: 3,
			imageFormat: "png",
			inputProps: { title: "edited" },
			output: first.file,
		});
		expect(calls.renderStill?.[0]?.serveUrl).toBe(started.bundles[0]);

		// No source change: the bundle is reused.
		await render({ ...request, frame: 4 }, new AbortController().signal);
		expect(started.bundles).toHaveLength(1);
		// A change rebuilds before the next still.
		lastServer().onFileChange?.(join(cwd, "src", "Root.tsx"));
		await render(request, new AbortController().signal);
		expect(started.bundles).toHaveLength(2);

		const workDir = (first.file.split("/stills/")[0] ?? "").trim();
		expect(existsSync(workDir)).toBe(true);
		started.interrupt();
		await started.done;
		// The session's bundles and stills are removed on exit.
		expect(existsSync(workDir)).toBe(false);
	});

	it("rejects a frame outside the composition", async () => {
		const started = await start([]);
		const render = lastServer().onRenderStill;
		await expect(
			render?.({ ...request, frame: COMPOSITION.durationInFrames }, new AbortController().signal),
		).rejects.toMatchObject({ code: "E_INVALID_ARGUMENT" });
		started.interrupt();
		await started.done;
	});

	it("drops a request the page aborted while it waited in the queue", async () => {
		const started = await start([]);
		const render = lastServer().onRenderStill;
		const controller = new AbortController();
		const pending = render?.(request, controller.signal);
		controller.abort();
		await expect(pending).rejects.toMatchObject({ code: "E_CANCELLED" });
		expect(started.renderer.calls.renderStill).toBeUndefined();
		started.interrupt();
		await started.done;
	});
});
