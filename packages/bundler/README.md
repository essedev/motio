# @motiojs/bundler

Builds a [Motio](https://motio.esse.dev) project with Vite into the page the renderer opens, and runs the `motio dev` server. It finds the entry point, copies `public/`, passes environment variables to the bundle and resolves Remotion imports through the compat alias. The CLI uses it for you; install it to render from a Node script.

```bash
pnpm add @motiojs/bundler @motiojs/renderer
```

## Bundle once, render many times

`bundle()` builds the project into a directory (a temporary one unless `outDir` is set) and returns its path, the `serveUrl` that `@motiojs/renderer` serves. Options: `entryPoint`, `rootDir` (the project root, default the working directory), `publicDir`, `outDir`, `envVariables`, and `viteOverride` for changes to the Vite configuration.

<!-- example: ../../docs/guide/examples/src/render-node.ts#render -->
```ts
import { bundle } from "@motiojs/bundler";
import { renderMedia, renderStill, selectComposition } from "@motiojs/renderer";

// 1. Build the project once; the result is a directory the renderer serves.
const serveUrl = await bundle({ entryPoint: "src/index.ts" });

// 2. Resolve the composition with the props of this render (runs calculateMetadata).
const inputProps = { title: "Rendered from Node" };
const composition = await selectComposition({ serveUrl, id: "Intro", inputProps });

// 3. Render the video, then a still.
await renderMedia({
	serveUrl,
	composition,
	inputProps,
	codec: "h264",
	outputLocation: "out/intro.mp4",
	onProgress: ({ progress }) => process.stdout.write(`\r${Math.round(progress * 100)}%`),
});
await renderStill({
	serveUrl,
	composition,
	inputProps,
	frame: 30,
	output: "out/frame-30.png",
});
```

## The project's configuration

`bundle()` and the render functions read no config file, unlike the CLI. `loadConfig()` returns what the CLI would use: `motio.config.ts` with the `MOTIO_*` variables over it, `bundleOptions` for `bundle()` and `sessionOptions` for the render functions.

<!-- example: ../../docs/guide/examples/src/load-config.ts#load -->
```ts
import { bundle, loadConfig } from "@motiojs/bundler";
import { renderMedia, selectComposition } from "@motiojs/renderer";

// The same settings as the CLI: motio.config.ts with the MOTIO_* variables over it.
const { config, bundleOptions, sessionOptions } = await loadConfig();

const serveUrl = await bundle(bundleOptions);
const composition = await selectComposition({ ...sessionOptions, serveUrl, id: "Intro" });
await renderMedia({
	...sessionOptions,
	...config.render,
	serveUrl,
	composition,
	codec: config.render?.codec ?? "h264",
	outputLocation: "out/intro.mp4",
});
```

## Compatibility

The compat alias maps `@remotion/bundler` here. Motio builds with Vite, not Webpack: a `webpackOverride` is rejected (use `viteOverride`), and `Config.overrideWebpackConfig()` in `remotion.config.ts` is read only to detect Tailwind.

Documentation: [motio.esse.dev/reference/packages/bundler](https://motio.esse.dev/reference/packages/bundler/) · Guide: [Rendering from Node](https://motio.esse.dev/guide/rendering-node/), [Configuration](https://motio.esse.dev/guide/configuration/) · Source: [packages/bundler](https://github.com/essedev/motio/tree/main/packages/bundler)
