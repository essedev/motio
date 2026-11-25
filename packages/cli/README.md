# @motiojs/cli

The `motio` command of [Motio](https://motio.esse.dev): create a project, preview it, render videos and stills, and check a setup. Every project created with `pnpm create motio` has it as a development dependency.

```bash
pnpm add -D @motiojs/cli
```

Run it through the package manager (`pnpm exec motio`, `npx motio`) or from the package.json scripts. `motio --help` lists the commands, `motio <command> --help` every flag, and `motio --version` prints the version.

| Command | What it does |
|---|---|
| `motio init` | Create a new project from a starter. |
| `motio render` | Render a video. |
| `motio still` | Render one frame as an image. |
| `motio compositions` | List the compositions of a project. |
| `motio frames` | Render a contact sheet: a grid PNG of evenly spaced frames. |
| `motio dev` | Start the preview page: compositions in a Player, hot reload, render check. |
| `motio browser ensure` | Download the pinned chrome-headless-shell if needed. |
| `motio ffmpeg ensure` | Download the pinned FFmpeg of `@motiojs/ffmpeg` if needed (when installed). |
| `motio doctor` | Check FFmpeg, the browser, the config and Remotion API compatibility. |
| `motio check determinism` | Render in two orders and two concurrencies and compare decoded frames. |
| `motio check flicker` | Flag frames that differ from both neighbours. |

```bash
pnpm exec motio render src/index.ts Intro out/intro.mp4
pnpm exec motio still src/index.ts Intro out/frame.png --frame=30
```

Every command takes `--json` and then prints one JSON object on stdout; its JSON Schema ships with the package (`@motiojs/cli/schemas/*`). Settings shared by the commands live in `motio.config.ts`.

## Compatibility

The `motio` command replaces Remotion's CLI: `motio render`, `motio still`, `motio compositions` and `motio dev` (in place of the Studio) take the same positional arguments and flags. Of `@remotion/cli`, only `@remotion/cli/config` can be imported, for `remotion.config.ts`; the compat alias maps it to `@motiojs/compat/config`.

Documentation: [CLI reference](https://motio.esse.dev/reference/cli/) · Guide: [Rendering from the CLI](https://motio.esse.dev/guide/rendering-cli/), [Configuration](https://motio.esse.dev/guide/configuration/), [Testing renders in CI](https://motio.esse.dev/guide/testing-in-ci/) · Source: [packages/cli](https://github.com/essedev/motio/tree/main/packages/cli)
