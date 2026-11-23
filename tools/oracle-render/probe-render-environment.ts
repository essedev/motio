// What the page of a render can use, measured from inside a composition rendered by the published
// Remotion (renderStill, chromiumOptions.gl "swangle") and by Motio (its default options): Chrome's
// HTML-in-canvas API (WICG html-in-canvas: drawElementImage, requestPaint, the paint event, and
// whether drawing an element through it gives its pixels),
// a WebGPU adapter and device, WebGL 2 and its renderer. The composition posts what it finds to a
// local server. Evidence for the @remotion/effects decision; prints JSON, writes nothing.
// Run: node probe-render-environment.ts (Motio's packages must be built).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const here = import.meta.dirname;
const root = resolve(here, "../..");
const fromMotio = createRequire(join(root, "packages/starburst/package.json"));
const reports: Record<string, unknown> = {};
const server = createServer((req, res) => {
	let body = "";
	req.on("data", (chunk) => {
		body += chunk;
	});
	req.on("end", () => {
		const who = new URL(req.url ?? "/", "http://localhost").searchParams.get("who") ?? "?";
		if (req.method === "POST") reports[who] = JSON.parse(body);
		res.writeHead(204, { "access-control-allow-origin": "*" }).end();
	});
});
await new Promise<void>((done) => server.listen(0, done));
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;

const probe = (who: string) => `
import { useEffect, useState } from "react";
import { Composition, continueRender, delayRender, registerRoot } from "remotion";
const Probe = () => {
	const [handle] = useState(() => delayRender("probe"));
	useEffect(() => {
		(async () => {
			const canvas = document.createElement("canvas");
			const out = {
				userAgent: navigator.userAgent,
				drawElementImage: typeof CanvasRenderingContext2D.prototype.drawElementImage === "function",
				requestPaint: typeof HTMLCanvasElement.prototype.requestPaint === "function",
				paintEvent: "onpaint" in HTMLCanvasElement.prototype,
				elementImage: typeof globalThis.ElementImage === "function",
				webgpu: false,
				webgpuDevice: false,
				webgl2: false,
				webglRenderer: null,
			};
			// Draw a red element into a canvas through the API and read a pixel back.
			try {
				const target = document.createElement("canvas");
				// Chrome 158 asks for content="drawable" on the canvas and "drawable" on the element (earlier
				// drafts of the API used a layoutsubtree attribute).
				target.setAttribute("content", "drawable");
				target.width = 20;
				target.height = 20;
				const child = document.createElement("div");
				child.style.cssText = "width:20px;height:20px;background:rgb(255,0,0)";
				child.setAttribute("drawable", "");
				target.appendChild(child);
				document.body.appendChild(target);
				const context = target.getContext("2d");
				await new Promise((done) => {
					target.onpaint = () => {
						try {
							context.drawElementImage(child, 0, 0);
						} catch (error) {
							out.drawError = String(error);
						}
						done();
					};
					target.requestPaint();
					setTimeout(done, 3000);
				});
				out.drawnPixel = Array.from(context.getImageData(10, 10, 1, 1).data);
				target.remove();
			} catch (error) {
				out.drawError = String(error);
			}
			try {
				const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
				out.webgpu = Boolean(adapter);
				out.webgpuDevice = Boolean(adapter && (await adapter.requestDevice()));
			} catch {
				out.webgpu = "error";
			}
			const gl = canvas.getContext("webgl2");
			out.webgl2 = Boolean(gl);
			const info = gl && gl.getExtension("WEBGL_debug_renderer_info");
			out.webglRenderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
			await fetch("http://localhost:${port}/?who=${who}", { method: "POST", body: JSON.stringify(out) });
			continueRender(handle);
		})();
	}, [handle]);
	return null;
};
registerRoot(() => <Composition id="probe" component={Probe} width={16} height={16} fps={30} durationInFrames={1} />);
`;

const work = mkdtempSync(join(tmpdir(), "motio-probe-env-"));
try {
	// Remotion, with the software WebGL the references are recorded with.
	mkdirSync(join(here, ".work-probe-env/src"), { recursive: true });
	writeFileSync(join(here, ".work-probe-env/src/index.tsx"), probe("remotion"));
	const serveUrl = await bundle({ entryPoint: join(here, ".work-probe-env/src/index.tsx") });
	const chromiumOptions = { gl: "swangle" as const };
	const composition = await selectComposition({ serveUrl, id: "probe", chromiumOptions });
	await renderStill({ serveUrl, composition, output: join(work, "remotion.png"), chromiumOptions });

	// Motio, with its defaults.
	const { createBundle } = await import(join(root, "packages/bundler/dist/index.js"));
	const renderer = await import(join(root, "packages/renderer/dist/index.js"));
	mkdirSync(join(work, "motio/src"), { recursive: true });
	writeFileSync(join(work, "motio/src/index.tsx"), probe("motio"));
	const motio = await createBundle({
		entryPoint: "src/index.tsx",
		rootDir: join(work, "motio"),
		outDir: join(work, "motio-out"),
		compat: { aliases: { remotion: join(root, "packages/motio/dist/index.js") } },
		// One React: the copy Motio's packages use.
		viteOverride: (config: { resolve?: object }) => ({
			...config,
			resolve: {
				...config.resolve,
				alias: [
					{ find: /^react$/, replacement: fromMotio.resolve("react") },
					{
						find: /^react\/(.*)$/,
						replacement: `${dirname(fromMotio.resolve("react/package.json"))}/$1`,
					},
					{ find: /^react-dom$/, replacement: fromMotio.resolve("react-dom") },
					{
						find: /^react-dom\/(.*)$/,
						replacement: `${dirname(fromMotio.resolve("react-dom/package.json"))}/$1`,
					},
				],
			},
		}),
	});
	const motioComposition = await renderer.selectComposition({
		serveUrl: motio.serveUrl,
		id: "probe",
		inputProps: {},
	});
	await renderer.renderStill({
		serveUrl: motio.serveUrl,
		composition: motioComposition,
		frame: 0,
		imageFormat: "png",
	});
} finally {
	server.close();
	rmSync(work, { recursive: true, force: true });
	rmSync(join(here, ".work-probe-env"), { recursive: true, force: true });
}
console.log(JSON.stringify(reports, null, "\t"));
process.exit(0);
