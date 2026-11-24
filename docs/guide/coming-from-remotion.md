# Coming from Remotion

Motio's API is compatible with the documented API of Remotion 4.0.545: the same components, hooks, functions and CLI commands, with the same behaviour, checked against values and frames recorded from the published Remotion package. A Remotion project can usually run on Motio without code changes. Motio is an independent project, built from Remotion's public API documentation and not affiliated with or endorsed by Remotion. Remotion is a trademark of its owner.

## Running a Remotion project

1. Install Motio next to the project's dependencies:

   ```bash
   pnpm add @motiojs/motio
   pnpm add -D @motiojs/cli
   ```

   and, for each `@remotion/<name>` package the project uses, `@motiojs/<name>` (`@remotion/transitions` becomes `@motiojs/transitions`).

2. Run the `motio` command instead of `remotion`: `motio render`, `motio still`, `motio compositions` and `motio dev` (in place of the Studio) take the same positional arguments and flags.

The bundler resolves `remotion` to `@motiojs/motio` and every `@remotion/<name>` to its Motio package while it builds, so imports can stay as they are. `remotion.config.ts` is read by every command, with the `Config` setters of `@remotion/cli/config`; `.env` files and `REMOTION_`-prefixed variables reach `process.env` as in Remotion.

To drop the Remotion packages altogether, replace the imports (`from "remotion"` becomes `from "@motiojs/motio"`, `from "@remotion/transitions"` becomes `from "@motiojs/transitions"`); TypeScript then checks the project against Motio's own types.

## Checking a project with doctor

```bash
pnpm exec motio doctor
```

Besides FFmpeg and the browser, `doctor` scans the project's imports and lists every Remotion symbol it uses with its status: supported, approximated (works, with a documented difference), stubbed (accepted, does nothing or fails with a message at build time) or missing. A package Motio does not provide fails the build with the package name and what to use instead, rather than at render time.

## How compatibility is kept

Compatibility is a stable layer, not a moving target (D-066 in the project's decision log):

- It is pinned at the **Remotion 4.0.545** API and checked by tests against recordings of that release. The pin moves on a schedule, every few months or at a significant Remotion release, not with every release; when it moves, changed behaviour of an API Motio already supports is aligned.
- A Remotion symbol or package that is missing is added when a real project needs it, not to match Remotion's list.
- Not planned: `@remotion/effects`, `@remotion/skia`, the web renderer, `@remotion/media-parser`, `@remotion/webcodecs`, `@remotion/whisper-web`, and the Lambda and Cloud Run packages (they wait for a use case). Distributed rendering on your own machines is available through `motio render --chunks` and `@motiojs/distributed`.
- Where Motio can do better it designs its own API and maps Remotion's onto it: `@remotion/rounded-text-box` is a preset of `@motiojs/text`'s [`<TextBackground>`](fonts-and-text.md#text-backgrounds) shape.

## Differences worth knowing

- **Bundler**: Motio builds with Vite, not Webpack. `Config.overrideWebpackConfig()` is read only to detect Tailwind; use the `viteOverride` option of `bundle()` for other changes.
- **Studio**: `motio dev` is a preview page with a player, a props editor and a render check, not Remotion's Studio editor.
- **Rendering**: frames are captured from a pinned `chrome-headless-shell`, downloaded on first use; FFmpeg is the system one or the optional pinned build of `@motiojs/ffmpeg` (see [FFmpeg](ffmpeg.md)).
- **Licence**: Motio is Apache-2.0, free for any use, including companies, distributed rendering and embedding the player in a product.
