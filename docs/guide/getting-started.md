# Getting started

> Motio is not published on npm yet, so `pnpm create motio` does not work today. [Try it from a clone](#try-it-from-a-clone) creates the same project from the repository; the rest of this page applies to both.

## Requirements

- Node 22 or later.
- FFmpeg 5.1 or later with libx264 on `PATH` (`brew install ffmpeg` on macOS, `sudo apt install ffmpeg` on Debian and Ubuntu). A pinned build, `@motiojs/ffmpeg`, is coming: see [FFmpeg](ffmpeg.md).
- Chrome is not needed: the first render downloads a pinned `chrome-headless-shell` into `~/.cache/motio/browsers`.

## Try it from a clone

Until the packages are on npm, the repository builds a project that installs them from local tarballs. It needs pnpm, and Node 22.18 or later to run the script:

```bash
git clone https://github.com/essedev/motio.git
cd motio
pnpm install
make try DIR=../my-video                     # or TEMPLATE=blank, TEMPLATE=captions
cd ../my-video
pnpm dev
```

`make try` builds the workspace, packs every published package with `pnpm pack` (the same files npm will serve) into `my-video/.motio/tarballs/`, and runs the clone's `motio init`, with a `pnpm-workspace.yaml` that maps every `@motiojs/*` package to its tarball. The project is otherwise what `pnpm create motio` will make, and works with pnpm only:

- `pnpm add @motiojs/transitions` (or any other Motio package) installs it from its tarball; `package.json` records the tarball's path.
- After pulling new commits into the clone, `make try-update DIR=../my-video` packs the packages again and reinstalls them, leaving your files alone.
- Once Motio is published, delete `.motio/` and `pnpm-workspace.yaml`, set the `@motiojs/*` versions in `package.json`, and install again.

## Create a project

```bash
pnpm create motio my-video
```

`npm create motio@latest my-video`, `yarn create motio my-video` and `bun create motio my-video` do the same. In a terminal it asks for the directory, the starter and the package manager, writes the project and installs its dependencies. The same command exists in the CLI as `motio init`.

| Starter | What it shows |
|---|---|
| `basic` (default) | A four-second title animation: `spring()` and `interpolate()`, two scenes in a `<Series>`, an image from `public/`, a local font, and a still for the thumbnail. |
| `blank` | One composition with a fading title, nothing else. |
| `captions` | Word-by-word captions read from a JSON transcript with `@motiojs/captions`, over a sound in step with the words; the video length comes from the transcript. |

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

`motio dev` starts a local server (port 3000, or the next free one) with a preview page: the list of compositions on the left, the selected one playing in a player with play, scrub, frame stepping, a loop range and keyboard shortcuts, and a JSON editor for its props. Saving a component updates the preview in place.

- **Time** is shown as a frame number and as a timecode, `HH:MM:SS:FF`, where the last two digits count frames inside the second: frame 40 at 30 fps is `00:00:01:10`.
- **The timeline** under the player has one row per `<Sequence>`, `<Series.Sequence>`, `<Loop>` and media component, nested as in the code and labelled with the sequence's `name` (the component's name without one). Its ruler scrubs with the pointer or the arrow keys, and clicking a bar jumps to the first frame of that sequence.
- **Problems** lists what a render would trip on while the player keeps playing: files that failed to load, `delayRender()` handles still open (with their age and where they were called), a `cancelRender()` with its error, and warnings such as a `staticFile()` name whose case differs from the file. The header shows how many there are.
- **Errors** thrown by a composition, the root or `calculateMetadata()` are shown in the page with the message, the stack mapped back to your files, the lines around the one that threw, and, for a composition, the frame it was thrown at; the frames of React and other dependencies are folded. A syntax error or an unresolved import shows the file and the code around it, in the page and in the terminal.
- **Props** keys that neither `defaultProps` nor the [schema](compositions.md) declare are flagged under the editor, with the closest known key: a `titel` asks whether you meant `title`.
- **Render still** renders the current frame through the real render pipeline. The result can be laid over the player to show the differences, downloaded, or saved into the project as `out/<composition>-<frame>.png`.

## Render

```bash
pnpm render   # motio render src/index.ts Intro out/intro.mp4
pnpm still    # motio still src/index.ts Thumbnail out/thumbnail.png
```

The scripts are plain CLI calls, and flags after them are passed on: `pnpm render --frames=0-29` renders the first second, `pnpm still --props='{"title":"Launch day"}'` changes the title (with npm, put `--` before the flags: `npm run render -- --frames=0-29`). For another output file or codec, call the CLI directly, as in [Rendering from the CLI](rendering-cli.md).

Settings that every render of the project should use, such as the codec, the quality or the format of stills, go in `motio.config.ts` at the project root, which the starter writes with the common keys commented out; every command reads it, and a flag still wins for one run. See [Configuration](configuration.md).

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
