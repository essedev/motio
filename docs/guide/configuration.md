# Configuration

`motio.config.ts`, in the project root, holds the settings of the `motio` commands: where the entry point is, which codec and quality a render uses, which Chrome and FFmpeg run, the port of the preview. Every key is optional and typed, so the editor completes the names and a mistyped one fails before anything renders. `motio init` writes a short one in every new project.

<!-- example: examples/src/config/motio.config.ts#full -->
```ts
import { defineConfig } from "@motiojs/motio/config";

export default defineConfig({
	entryPoint: "src/index.ts",
	publicDir: "public",
	outDir: "out",
	render: { codec: "h264", crf: 18, concurrency: "50%", imageFormat: "jpeg", muted: false },
	still: { imageFormat: "png", scale: 1 },
	browser: { timeoutMs: 30_000, chromiumOptions: { gl: "swiftshader" } },
	dev: { port: 3000, open: true },
	// Extend Vite: change the configuration and return it.
	vite: (config) => ({ ...config, define: { ...config.define, __BUILD_ID__: '"local"' } }),
});
```

`defineConfig` only gives the object its type; the file is plain TypeScript and may compute values or import packages. A key set to `undefined` counts as unset.

## Where a value comes from

For each setting, the first of these that has a value wins:

1. a flag on the command line (`--crf=20`);
2. a `MOTIO_*` environment variable, for the settings that depend on the machine (see below);
3. `motio.config.ts`;
4. Motio's default.

So the file holds what the project wants, the environment adapts it to a machine (a CI runner with fewer cores, no GPU, Chrome or FFmpeg in another place), and a flag changes one run.

## The file

The commands look for `motio.config.ts`, `motio.config.mts`, `motio.config.js` and `motio.config.mjs`, in that order, in the project root: the folder with the `package.json` above the entry point, so running from `src/` or from a parent folder finds the same file. `--config <path>` reads another file instead, by any name, relative to the working directory. The file is compiled the way Vite compiles the project, so TypeScript needs no extra tool.

Paths in the file (`entryPoint`, `publicDir`, `outDir`, `envFile`) are relative to the project root.

When the file is invalid, the command stops before bundling, exits with code 2 and names every wrong key at once, with the nearest valid key or value:

```text
error [E_INVALID_CONFIG]: /work/my-video/motio.config.ts has 2 problems:
  unknown key "render.codex". Did you mean "render.codec"?
  render.crf must be an integer of at least 0; got "18".
```

`motio doctor` says which config file is in use.

## Keys

### Project

| Key | Default | What it sets |
|---|---|---|
| `entryPoint` | found in common paths (`src/index.ts`, ...) | The file that calls `registerRoot()`. An entry point on the command line wins. |
| `publicDir` | `public` | Static files served by `staticFile()` (`--public-dir`). |
| `outDir` | `out` | Where renders, stills and contact sheets go when no output is given. |
| `envFile` | `.env`, else `.env.local` | Dotenv file whose variables reach the bundle (`--env-file`). |
| `logLevel` | `info` | `trace`, `verbose`, `info`, `warn` or `error` for the browser and renderer logs (`--log` sets the CLI's own output too). |
| `tailwind` | off | `"v4"` or `"v3"`: compiles Tailwind CSS with the version installed in the project. |
| `vite` | none | A function that receives Vite's configuration and returns it changed, for every bundle and for `motio dev`. Annotate its parameter with `InlineConfig` from `vite` for Vite's full types. |

### `render`

Defaults of `motio render`, named like the options of `renderMedia()`. `render --sequence` uses the capture settings too, and `frames` and the checks use `concurrency`.

| Key | Default | Flag |
|---|---|---|
| `codec` | from the output extension, else `h264` | `--codec` |
| `crf` | per codec | `--crf` |
| `concurrency` | half of the CPU threads, at most 8 | `--concurrency` |
| `imageFormat` | `jpeg` (`png` keeps transparency) | `--image-format` |
| `jpegQuality` | 80 | `--jpeg-quality` |
| `scale` | 1 | `--scale` |
| `muted` | `false` | `--muted` |
| `pixelFormat` | per codec | `--pixel-format` |
| `colorSpace` | `default` | `--color-space` |
| `x264Preset` | `medium` | `--x264-preset` |
| `proResProfile` | `hq`, used with `prores` only | `--prores-profile` |
| `numberOfGifLoops` | loops forever, used with `gif` only | `--number-of-gif-loops` |
| `everyNthFrame` | 1 | `--every-nth-frame` |
| `audioCodec` | per codec: `aac`, `mp3`, `opus` or `pcm-16` | `--audio-codec` |
| `audioBitrate` | per codec, such as `"128k"` | `--audio-bitrate` |
| `sampleRate` | 48000 | `--sample-rate` |
| `enforceAudioTrack` | `false` | `--enforce-audio-track` |
| `preferLossless` | `false` | none |
| `overwrite` | `true` | `--overwrite` |
| `imageSequencePattern` | `frame-[frame].[ext]` | `--image-sequence-pattern` |
| `timeModel` | the composition's, else `frame` | `--time-model` |

### `still`

Defaults of `motio still`, named like the options of `renderStill()`. `scale`, `jpegQuality` and `overwrite` are separate from those of `render`, so a project can render videos at 1x and thumbnails at 2x.

| Key | Default | Flag |
|---|---|---|
| `imageFormat` | from the output extension, else `png`; also `jpeg`, `webp`, `pdf` | `--image-format` |
| `jpegQuality` | 80 | `--jpeg-quality` |
| `scale` | 1 | `--scale` |
| `overwrite` | `true` | `--overwrite` |

### `browser`

The headless Chrome every command renders in.

| Key | Default | Flag |
|---|---|---|
| `executable` | the pinned `chrome-headless-shell` | `--browser-executable` |
| `timeoutMs` | 30000: how long a frame may wait on `delayRender()` | `--timeout` |
| `captureMethod` | `auto` | `--capture-method` |
| `pagesPerBrowser` | the pages spread over two browsers | `--pages-per-browser` |
| `raster` | `cpu`; `gpu` when `chromiumOptions.gl` is `swangle` (see [Raster and canvas](#raster-and-canvas)) | `--raster` |
| `canvas` | `software` (see [Raster and canvas](#raster-and-canvas)) | `--canvas` |
| `timeZone` | `UTC` on every machine: the zone of the page's `Date` and `Intl`, an IANA name such as `Europe/Rome` (see [Dates and the time zone](frames-and-time.md#dates-and-the-time-zone)) | `--time-zone` |
| `chromiumOptions.gl` | SwiftShader, software rendering that draws the same pixels on every machine; `angle`, `egl` or `vulkan` use the GPU | `--gl` |
| `chromiumOptions.userAgent` | Chrome's | `--user-agent` |
| `chromiumOptions.ignoreCertificateErrors` | `false` | `--ignore-certificate-errors` |
| `chromiumOptions.disableWebSecurity` | `false` | `--disable-web-security` |
| `chromiumOptions.darkMode` | `false` | `--dark-mode` |
| `chromiumOptions.headless` | `true` | none |

### Raster and canvas

Two settings choose how Chrome draws, and with them whose pixels a render reproduces. Both are project choices: they have no `MOTIO_*` variable, and a flag wins over the file.

**`raster`** says where Chrome rasterises the page. Remotion's own pixels depend on its `gl` setting, and Motio follows: `cpu` gives the pixels Remotion renders with its default setting, `gpu` (SwiftShader, still software) those it renders with `gl: "swangle"`, its default on Lambda and Cloud Run. On Motio's reference stills each pairing is identical, 29 of 29, and the other one is not; on two production projects whose references were recorded with `swangle`, 184 of 186 compositions are within Remotion's thresholds with `gpu` against 161 with `cpu`, the difference being the antialiased edges of thin strokes, text and borders. So a project that sets `gl: "swangle"` (in `chromiumOptions`, `--gl`, `MOTIO_GL` or `remotion.config.ts`) gets `gpu` unless `raster` is set; an explicit `raster` always wins. The cost is speed on videos: their opaque frames then composite on SwiftShader too, and the benchmark takes about 2.5 times as long (transparent captures, already composited that way, take up to 2 times as long).

**`canvas`** says how a 2D `<canvas>` is drawn where Chrome composites on the GPU: transparent captures (PNG with alpha, ProRes 4444, VP9 with alpha, PNG image sequences, `motio check determinism`) and the GPU raster. Opaque videos with the CPU raster draw the same pixels either way.

- `software` (the default) is deterministic under load: 0 of 1,140 frames differed at a load average of 34 to 90, against 2 of 1,080 with `gpu`. It is also much faster on heavy canvases: 60 transparent frames of 4,000 particles took 7 to 13 s against 102 to 133 s, and under load a single GPU canvas frame could exceed the 35 s watchdog.
- `gpu` draws canvases as Remotion does. In software, canvas content stays close but not identical to Remotion's: Rive animations measured 37 dB from Remotion's stills and the HTML-in-canvas transitions 34 dB at worst, below the 40 dB Motio's parity tests require; on the GPU they are identical or above 50 dB.

When to pick what:

- Leave both alone for new work, and for projects rendered with Remotion's default setting.
- `raster: "gpu"`, or `gl: "swangle"`, to reproduce renders made with Remotion on Lambda, Cloud Run or with `gl: "swangle"`, accepting slower videos.
- `canvas: "gpu"` to match Remotion pixel for pixel on transparent output with canvases (Rive, HTML-in-canvas transitions, GIFs), accepting rare differences between runs under load. `motio check determinism` suggests `--canvas=software` when its differences all lie inside canvases drawn on the GPU.

Hardware GL (`angle`, `egl`, `vulkan`) keeps Chrome's own choices unless `raster` or `canvas` is set.

### `ffmpeg`

| Key | Default |
|---|---|
| `executable` | `@motiojs/ffmpeg` when installed, else `ffmpeg` on `PATH` (see [FFmpeg](ffmpeg.md)). An absolute path or a command name. |
| `ffprobeExecutable` | next to `executable`, else on `PATH` |

### `dev`

The preview server of `motio dev`.

| Key | Default | Flag |
|---|---|---|
| `port` | 3000; when taken, the next free port | `--port` (fails when taken) |
| `host` | `localhost` | `--host` |
| `open` | `false` | `--open` |
| `keyboardShortcuts` | `true` | `--disable-keyboard-shortcuts` |

Settings that belong to one run, such as the composition, the output file, `--frames`, `--props` or the size overrides, stay on the command line.

## Environment variables

These variables override the file and are overridden by flags. Each is named after the flag it mirrors, and none reaches the bundle as `process.env`.

| Variable | Key |
|---|---|
| `MOTIO_CONCURRENCY` | `render.concurrency` |
| `MOTIO_TIMEOUT` | `browser.timeoutMs` |
| `MOTIO_LOG` | `logLevel` |
| `MOTIO_BROWSER_EXECUTABLE` | `browser.executable` |
| `MOTIO_GL` | `browser.chromiumOptions.gl` |
| `MOTIO_CAPTURE_METHOD` | `browser.captureMethod` |
| `MOTIO_PAGES_PER_BROWSER` | `browser.pagesPerBrowser` |
| `MOTIO_FFMPEG` | `ffmpeg.executable` |
| `MOTIO_FFPROBE` | `ffmpeg.ffprobeExecutable` |

Project choices such as the codec have no variable: they belong in the file, where they are versioned with the code. An invalid value fails like an invalid key, naming the variable.

## From Node

The Node API never reads the config file by itself: a script passes every option explicitly, so what it renders does not change with the folder it runs in. To render with the same settings as the CLI, load the file with `loadConfig()` from `@motiojs/bundler`. It returns the validated settings with the `MOTIO_*` variables applied, and the same settings as options of `bundle()` and of the renderer:

<!-- example: examples/src/load-config.ts#load -->
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

`loadConfig({ rootDir, configFile, env })` looks in the working directory by default; `env: false` reads the file alone. See [Rendering from Node](rendering-node.md) for the rest of the API.

## `remotion.config.ts`

A project that comes from Remotion can keep its `remotion.config.ts`: Motio reads its `Config` setters and says which ones have no effect (see [Coming from Remotion](coming-from-remotion.md)). The `MOTIO_*` variables apply over it too. When a project has both files, `motio.config.ts` wins and every command warns that the other is ignored. `--config` reads a file named `remotion.config.*` as a Remotion config and any other name as a Motio config.
