# Project structure

The `basic` starter, after `motio init`:

```text
my-video/
  package.json        scripts and dependencies
  tsconfig.json       TypeScript, strict
  README.md
  AGENTS.md           notes for coding agents (CLAUDE.md imports it)
  public/             static files: images, fonts, videos, data
    logo.svg
    fonts/inter-400.woff2, inter-700.woff2, inter-LICENSE.txt
  src/
    index.ts          the entry point: registerRoot(Root)
    Root.tsx          the compositions
    Intro.tsx         the video: two scenes in a <Series>
    Title.tsx, Logo.tsx
    Thumbnail.tsx     a still
    fonts.ts          loads Inter from public/fonts
  out/                renders (ignored by git)
```

## The entry point and the root

`src/index.ts` calls `registerRoot()` once with the root component:

<!-- example: ../../packages/cli/starters/basic/src/index.ts -->
```ts
import { registerRoot } from "@motiojs/motio";
import { Root } from "./Root";

registerRoot(Root);
```

The root renders one `<Composition>` per video and one `<Still>` per image (see [Compositions](compositions.md)):

<!-- example: ../../packages/cli/starters/basic/src/Root.tsx -->
```tsx
import { Composition, Still } from "@motiojs/motio";
import "./fonts";
import { INTRO_DURATION, Intro, type IntroProps } from "./Intro";
import { Thumbnail } from "./Thumbnail";

const defaultProps: IntroProps = {
	title: "Hello, Motio",
	subtitle: "Videos made with React",
};

export const Root = () => (
	<>
		<Composition
			id="Intro"
			component={Intro}
			width={1280}
			height={720}
			fps={30}
			durationInFrames={INTRO_DURATION}
			defaultProps={defaultProps}
		/>
		<Still
			id="Thumbnail"
			component={Thumbnail}
			width={1280}
			height={720}
			defaultProps={defaultProps}
		/>
	</>
);
```

The root is not a video itself: Motio renders it to collect the compositions, then renders the one you asked for. Keep it free of side effects other than imports such as `./fonts`.

Every command takes the entry point as its first argument (`motio render src/index.ts Intro`). When it is left out, Motio tries `src/index.ts`, `src/index.tsx`, `src/index.js` and `src/index.mjs`, then the same names under `remotion/` and `src/remotion/`.

## public/

Files in `public/` are served next to the bundle. Reference them with `staticFile()`, which turns a path relative to `public/` into a URL that works in the preview and in renders:

<!-- example: examples/src/media.tsx#img -->
```tsx
import { AbsoluteFill, Img, staticFile } from "@motiojs/motio";

export const Cover = () => (
	<AbsoluteFill>
		{/* public/cover.jpg; the frame is captured only once the image has loaded. */}
		<Img
			src={staticFile("cover.jpg")}
			style={{ width: "100%", height: "100%", objectFit: "cover" }}
		/>
	</AbsoluteFill>
);
```

Do not import large media with `import video from "./clip.mp4"`; put it in `public/` instead, so it is copied once and never inlined into the JavaScript bundle. `getStaticFiles()` lists the files of `public/` at run time. `--public-dir` points at another directory.

## Importing files

Code can also import files, as in any Vite project. An image, font, video or audio file imports as its URL, `?raw` imports a file's text, `?url` the URL of any file, and a CSS module (`*.module.css`) its class names:

<!-- example: examples/src/imports.tsx#imports -->
```tsx
import font from "./brand.woff2"; // a URL
import styles from "./card.module.css"; // the class names: { card: "..." }
import logo from "./logo.svg"; // a URL
import notes from "./notes.md?raw"; // the text of the file
```

Imported files are part of the bundle: small ones are inlined, others copied next to it. Use this for files that belong to the code (a logo, a font, a data file); keep large media in `public/`.

TypeScript knows these imports through the types of `@motiojs/motio/client`, which every starter's `tsconfig.json` lists in `"types": ["@motiojs/motio/client"]`. In a project created otherwise, add it there, or put `/// <reference types="@motiojs/motio/client" />` in a `.d.ts` file under `src/`.

A file outside the project directory (`import changelog from "../../CHANGELOG.md?raw"`) is bundled for renders like any other, and `motio dev` serves every file the project's code references, through an import, a CSS `url()` or `new URL(..., import.meta.url)`. Other files outside the project, or outside its workspace in a monorepo, are refused, and the dev server prints a warning that names the file.

## package.json

| Script | Command |
|---|---|
| `dev` | `motio dev src/index.ts` |
| `render` | `motio render src/index.ts <composition> out/<name>.mp4` |
| `still` | `motio still src/index.ts <composition> out/<name>.png` |
| `typecheck` | `tsc` |

Dependencies: `@motiojs/motio` (components and hooks), React, and the feature packages a starter uses (`@motiojs/fonts`, `@motiojs/captions`). Development dependencies: `@motiojs/cli` (the `motio` command), TypeScript and `@types/react`. Every Motio package has the same version; upgrade them together.

## Environment variables

`process.env.NAME` in project code reads variables from a `.env` file at the project root (`--env-file` reads another), and variables whose name starts with `MOTIO_` (or `REMOTION_`, as Remotion projects name them) from the environment of the command; the `MOTIO_` variables that configure Motio's own tools, such as `MOTIO_FFMPEG`, are not passed. They are compiled into the bundle, so never put secrets in them.

## Configuration

Motio has no configuration file of its own yet: use the CLI flags, or the options of the [Node API](rendering-node.md). A `remotion.config.ts` file, written for Remotion, is read by every command (see [Coming from Remotion](coming-from-remotion.md)).
