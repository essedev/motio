# Getting started

> Motio is not published on npm yet. The commands below are the ones that will work once it is; until then a project can only be built from a clone of the repository.

## Requirements

- Node 22 or later.
- FFmpeg 5.1 or later with libx264 on `PATH`, or the pinned build of `@motiojs/ffmpeg` (see [FFmpeg](ffmpeg.md)).
- Chrome is not needed: the first render downloads a pinned `chrome-headless-shell` into `~/.cache/motio/browsers`.

## Create a project

```bash
pnpm create motio my-video
```

`npm create motio@latest my-video`, `yarn create motio my-video` and `bun create motio my-video` do the same. In a terminal it asks for the directory, the starter and the package manager, writes the project and installs its dependencies. The same command exists in the CLI as `motio init`.

| Starter | What it shows |
|---|---|
| `basic` (default) | A four-second title animation: `spring()` and `interpolate()`, two scenes in a `<Series>`, an image from `public/`, a local font, and a still for the thumbnail. |
| `blank` | One composition with a fading title, nothing else. |
| `captions` | Word-by-word captions read from a JSON transcript with `@motiojs/captions`; the video length comes from the transcript. |

Every question has a flag, so scripts and agents can run it without a terminal:

```bash
pnpm create motio my-video --template blank --pm npm --yes
```

| Flag | Meaning |
|---|---|
| `[dir]` | Directory to create (default `my-video`). `.` uses the current directory. |
| `--template`, `-t` | `basic`, `blank` or `captions`. |
| `--pm` | `pnpm`, `npm`, `yarn` or `bun`. Default: the package manager that ran the command, else pnpm. |
| `--name` | Package name (default: from the directory name). |
| `--no-install` | Write the files only. |
| `--yes`, `-y` | Ask nothing; flags that are missing take their defaults. |
| `--force` | Write into a non-empty directory. Files with the same names are replaced, other files are left alone. Without it, a non-empty directory is refused. |
| `--json` | Ask nothing and print one JSON object: the directory, the files written, the next steps. |

## Preview

```bash
cd my-video
pnpm dev
```

`motio dev` starts a local server (port 3000, or the next free one) with a preview page: the list of compositions on the left, the selected one playing in a player with play, scrub, frame stepping, a loop range and keyboard shortcuts, and a JSON editor for its props. Saving a component updates the preview in place. "Render still" renders the current frame through the real render pipeline and can overlay it on the preview to compare.

## Render

```bash
pnpm render   # motio render src/index.ts Intro out/intro.mp4
pnpm still    # motio still src/index.ts Thumbnail out/thumbnail.png
```

The scripts are plain CLI calls, and flags after them are passed on: `pnpm render --frames=0-29` renders the first second, `pnpm still --props='{"title":"Launch day"}'` changes the title (with npm, put `--` before the flags: `npm run render -- --frames=0-29`). For another output file or codec, call the CLI directly, as in [Rendering from the CLI](rendering-cli.md).

To see the whole video without watching it, render a contact sheet, a grid of evenly spaced frames:

```bash
pnpm exec motio frames src/index.ts Intro out/sheet.png
```

## Check the setup

```bash
pnpm exec motio doctor
```

`doctor` checks FFmpeg (version, encoders), the browser and the project, and says how to fix what fails. Every command takes `--json` and prints exactly one JSON object on stdout, with error codes that stay stable across releases; the schemas are in the CLI package (`schemas/`).

## Next

[Project structure](project-structure.md) explains each file of the project, then [Frames and time](frames-and-time.md) starts the core concepts.
