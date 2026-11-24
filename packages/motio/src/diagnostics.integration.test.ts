// What a render tells the user when something in the project is wrong (the new-user usability
// audit): page warnings in the result, a missing image or font with its own code, the path in
// public/ and the closest file name, an error thrown by a component mapped to its source line,
// and the delayRender() handles a slow frame waits on. The project is written to a temporary
// folder, bundled with @motiojs/bundler and rendered with @motiojs/renderer.
import { copyFile, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createBundle } from "@motiojs/bundler";
import {
	getCompositions,
	MotioError,
	type PendingDelayRender,
	renderMedia,
	renderStill,
	selectComposition,
} from "@motiojs/renderer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`));
const packages = resolve(import.meta.dirname, "../..");
const publicSource = resolve(import.meta.dirname, "../../../fixtures/compositions/public");

const ROOT = `import {
	AbsoluteFill,
	Composition,
	continueRender,
	delayRender,
	Img,
	staticFile,
	useCurrentFrame,
} from "@motiojs/motio";
import { linearTiming, TransitionSeries } from "@motiojs/transitions";
import { fade } from "@motiojs/transitions/fade";
import { useState } from "react";

const Warns = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{ background: "white" }}>
			<TransitionSeries>
				<TransitionSeries.Sequence durationInFrames={6}>
					<div style={{ fontFamily: "Comic Neue Pro", fontSize: 20 }}>Hello {frame}</div>
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 2 })} />
				<TransitionSeries.Sequence durationInFrames={4}>
					<Img src={staticFile("Photo.PNG")} style={{ width: 20, left: Math.random() * 10 }} />
				</TransitionSeries.Sequence>
			</TransitionSeries>
		</AbsoluteFill>
	);
};

const Missing = () => <Img src={staticFile("phot.png")} />;

const Throws = () => {
	const frame = useCurrentFrame();
	if (frame === 2) {
		throw new Error("Boom at frame two"); // THROW_LINE
	}
	return <div>{frame}</div>;
};

const Waits = () => {
	useState(() => {
		const handle = delayRender("Waiting for the API");
		setTimeout(() => continueRender(handle), 6500);
		return handle;
	});
	return null;
};

export const Root = () => (
	<>
		<Composition id="Warns" component={Warns} width={64} height={64} fps={30} durationInFrames={12} />
		<Composition id="Missing" component={Missing} width={64} height={64} fps={30} durationInFrames={4} />
		<Composition id="Throws" component={Throws} width={64} height={64} fps={30} durationInFrames={4} />
		<Composition id="Waits" component={Waits} width={64} height={64} fps={30} durationInFrames={1} />
	</>
);
`;

const INDEX = `import { registerRoot } from "@motiojs/motio";
import { Root } from "./Root";

registerRoot(Root);
`;

// A font loaded at module level whose file name is wrong.
const BROKEN_FONT = `import { loadFont } from "@motiojs/fonts";
import { Composition, registerRoot, staticFile } from "@motiojs/motio";

loadFont({ family: "Inter", url: staticFile("fonts/inter-40.woff2") });

const Text = () => <div style={{ fontFamily: "Inter" }}>Text</div>;

registerRoot(() => (
	<Composition id="Text" component={Text} width={64} height={64} fps={30} durationInFrames={2} />
));
`;

let projectDir: string;
let serveUrl: string;
let brokenFontUrl: string;

async function bundleEntry(entryPoint: string): Promise<string> {
	const outDir = await mkdtemp(join(tmpdir(), "motio-diagnostics-out-"));
	const result = await createBundle({
		entryPoint,
		rootDir: projectDir,
		outDir,
		envVariables: {},
		viteOverride: (config) => ({
			...config,
			resolve: {
				...config.resolve,
				alias: [
					{ find: /^@motiojs\/motio$/, replacement: join(packages, "motio/dist/index.js") },
					{ find: /^@motiojs\/fonts$/, replacement: join(packages, "fonts/dist/index.js") },
					{
						find: /^@motiojs\/transitions$/,
						replacement: join(packages, "transitions/dist/index.js"),
					},
					{
						find: /^@motiojs\/transitions\/fade$/,
						replacement: join(packages, "transitions/dist/presentations/fade.js"),
					},
					{ find: /^react$/, replacement: require.resolve("react") },
					{ find: /^react\/(.*)$/, replacement: `${packageDir("react")}/$1` },
					{ find: /^react-dom$/, replacement: require.resolve("react-dom") },
					{ find: /^react-dom\/(.*)$/, replacement: `${packageDir("react-dom")}/$1` },
				],
			},
		}),
	});
	return result.serveUrl;
}

beforeAll(async () => {
	// The real path: source maps name files by it (/var is a link to /private/var on macOS).
	projectDir = await realpath(await mkdtemp(join(tmpdir(), "motio-diagnostics-")));
	await mkdir(join(projectDir, "src"), { recursive: true });
	await mkdir(join(projectDir, "public", "fonts"), { recursive: true });
	await writeFile(
		join(projectDir, "package.json"),
		'{ "name": "diagnostics", "type": "module" }\n',
	);
	await writeFile(join(projectDir, "src", "Root.tsx"), ROOT);
	await writeFile(join(projectDir, "src", "index.ts"), INDEX);
	await writeFile(join(projectDir, "src", "broken-font.tsx"), BROKEN_FONT);
	await copyFile(join(publicSource, "photo.png"), join(projectDir, "public", "photo.png"));
	await copyFile(
		join(publicSource, "inter-400.woff2"),
		join(projectDir, "public", "fonts", "inter-400.woff2"),
	);
	serveUrl = await bundleEntry("src/index.ts");
	brokenFontUrl = await bundleEntry("src/broken-font.tsx");
}, 180_000);

afterAll(async () => {
	if (projectDir) await rm(projectDir, { recursive: true, force: true });
	for (const dir of [serveUrl, brokenFontUrl]) {
		if (dir) await rm(dir, { recursive: true, force: true });
	}
});

async function rejection(p: Promise<unknown>): Promise<MotioError> {
	try {
		await p;
	} catch (err) {
		if (err instanceof MotioError) return err;
		throw err;
	}
	throw new Error("expected a rejection");
}

describe("render diagnostics", () => {
	it("returns the page warnings, each once with the first frame it was seen on", async () => {
		const composition = await selectComposition({ serveUrl, id: "Warns" });
		const result = await renderMedia({
			serveUrl,
			composition,
			codec: "h264",
			muted: true,
			concurrency: 2,
		});
		const codes = result.warnings.map((w) => w.code).sort();
		expect(codes).toEqual(
			expect.arrayContaining([
				"W_FONT_FALLBACK",
				"W_MATH_RANDOM",
				"W_STATIC_FILE_CASE",
				"W_TIMELINE_SHORT",
			]),
		);
		expect(new Set(result.warnings.map((w) => `${w.code} ${w.message}`)).size).toBe(
			result.warnings.length,
		);
		expect(result.warnings.find((w) => w.code === "W_FONT_FALLBACK")).toMatchObject({
			message: expect.stringContaining('Font "Comic Neue Pro" is not available'),
			frame: 0,
		});
		expect(result.warnings.find((w) => w.code === "W_TIMELINE_SHORT")?.message).toContain(
			"lasts 8 frames",
		);
		expect(result.warnings.find((w) => w.code === "W_STATIC_FILE_CASE")?.message).toContain(
			'write staticFile("photo.png")',
		);
	}, 120_000);

	it("fails fast on a missing image, with the path in public/ and the closest name", async () => {
		const composition = await selectComposition({ serveUrl, id: "Missing" });
		const started = performance.now();
		const err = await rejection(renderStill({ serveUrl, composition }));
		expect(performance.now() - started).toBeLessThan(5_000);
		expect(err.code).toBe("E_ASSET_NOT_FOUND");
		expect(err.message).toBe(
			'<Img> could not load public/phot.png: the file does not exist (HTTP 404). Did you mean staticFile("photo.png")?',
		);
		expect(err.details).toMatchObject({
			frame: 0,
			compositionId: "Missing",
			path: "phot.png",
			suggestion: "photo.png",
		});
	}, 60_000);

	it("maps an error thrown by a component to its line in the project's source", async () => {
		const composition = await selectComposition({ serveUrl, id: "Throws" });
		const err = await rejection(renderMedia({ serveUrl, composition, codec: "h264", muted: true }));
		expect(err.code).toBe("E_RENDER_ERROR");
		expect(err.message).toBe("Boom at frame two");
		const line = ROOT.split("\n").findIndex((l) => l.includes("THROW_LINE")) + 1;
		expect(err.details?.source).toMatchObject({
			file: join(projectDir, "src", "Root.tsx"),
			line,
		});
		expect(err.details).toMatchObject({ frame: 2, compositionId: "Throws" });
		expect(err.pageStack).toContain(`${join(projectDir, "src", "Root.tsx")}:${line}:`);
		expect(err.details?.rawStack).toContain("/assets/");
	}, 60_000);

	it("reports the delayRender() handles a frame waits on while it waits", async () => {
		const composition = await selectComposition({ serveUrl, id: "Waits" });
		const pending: PendingDelayRender[] = [];
		await renderStill({
			serveUrl,
			composition,
			onDelayRenderPending: (p) => pending.push(p),
		});
		expect(pending.length).toBeGreaterThanOrEqual(1);
		expect(pending[0]).toMatchObject({
			label: "Waiting for the API",
			frame: 0,
			compositionId: "Waits",
			timeoutMs: 30_000,
		});
		expect(pending[0]?.elapsedMs).toBeGreaterThanOrEqual(4_000);
	}, 60_000);

	it("lists compositions when a module-level font fails, and fails the render with E_FONT_LOAD", async () => {
		const compositions = await getCompositions({ serveUrl: brokenFontUrl });
		expect(compositions.map((c) => c.id)).toEqual(["Text"]);
		const err = await rejection(
			renderStill({ serveUrl: brokenFontUrl, composition: compositions[0] as never }),
		);
		expect(err.code).toBe("E_FONT_LOAD");
		expect(err.message).toBe(
			'loadFont() could not fetch public/fonts/inter-40.woff2: the file does not exist (HTTP 404). Did you mean staticFile("fonts/inter-400.woff2")?',
		);
		expect(err.details).toMatchObject({
			path: "fonts/inter-40.woff2",
			suggestion: "fonts/inter-400.woff2",
		});
	}, 60_000);
});
