# Testing renders in CI

Watching every video after every change does not scale. Motio's CLI can check a project without anyone looking at it, and every command reports in a form a CI job or an AI agent can read.

## --json and exit codes

With `--json`, a command prints exactly one JSON object on stdout and nothing else there; progress and logs go to stderr. A result has `ok: true`, the command name, its data and `warnings` (one line of text each); when the page reported warnings during a render, `renderWarnings` lists them as `{ code, message, frame }`, each once with the first frame it was seen on. A failure has `ok: false` and an `error` with a stable `code`, a message and a `context`: the frame and the composition, and `details` with what the code knows, such as `source` (the file, line and column in your code where a page error was thrown), `hint`, or the `path` and `suggestion` of a missing file. The JSON schemas ship with the CLI, in `node_modules/@motiojs/cli/schemas/`.

The exit code says what happened: 0 success, 1 error, 2 invalid input, 3 a check ran and found a problem. Every kind of invalid input exits with 2: an unknown command or flag (the message names the closest valid one), a value out of range, an output extension no codec writes, a composition id that does not exist. A CI step fails on anything but 0 without parsing the output. `motio --version` prints the version of the CLI, for the job's log.

## Determinism

```bash
pnpm exec motio check determinism src/index.ts Intro --frames=0-
```

Renders the frames several times (ascending and descending order, on one tab and on several) and compares the decoded pixels. A frame that differs between runs depends on something other than its number: state kept between frames, `Math.random()`, a clock, or an animation library running on real time (see [Frames and time](frames-and-time.md)). The report names the frames, as ranges, and says what the pattern of differences points to:

```text
Not deterministic: 5 of 60 frames differ between runs.
Frames: 51-55
One tab and several tabs disagree: a race, something that loads or finishes at a different moment in each run (a fetch, a font or an image not held with delayRender()).
```

The diagnosis follows which runs disagree: every run different points to randomness or the clock, ascending against descending to a frame that depends on the previous one, one tab against several to a race, and differences of more than one kind are reported as mixed. Frames that call `Math.random()` are also named by a `W_MATH_RANDOM` warning, printed before the report.

By default it checks the first 60 frames; `--frames=0-` checks all of them. Two runs can agree with each other and still be wrong when both pages carry the same history (state left by the frames each page rendered before). `--reference=fresh` adds a first run that renders every frame on a new page and compares the others with it; frames that differ only from that run are diagnosed as `history`. With `--json`, `diagnosis` has the `cause` (`random`, `order`, `race`, `history` or `mixed`) and the message, and `mismatches` lists each differing frame with the pixel hash of every run.

## Flicker

```bash
pnpm exec motio check flicker src/index.ts Intro --frames=0-
```

Flags frames that differ from both neighbours by more than a threshold (mean difference from 0 to 1, default 0.02) while the neighbours resemble each other: a single frame where an image had not loaded, a font fell back, or an element jumped. It also compares each block of 16 by 16 pixels on its own, against five times the threshold, so a small element shown for one frame only is flagged even when the frame as a whole barely changes:

```text
Flicker on 1 frame(s):
  frame 10: 4 block(s) of 16 px shown for this frame only, up to 56% different, in 32x32 at 96,96
```

With `--json`, each entry of `flagged` has the frame, its differences from the previous frame, the next one and between the two neighbours, and, when blocks jumped, `blocks` with their number, the region they cover and the largest difference. Fast cuts between scenes are legitimate jumps; raise `--threshold` or narrow `--frames` around them.

## Looking without watching

- `motio still` renders a frame to compare with a reference image.
- `motio frames` writes a contact sheet, a grid of evenly spaced frames in one PNG, that a reviewer or an agent can inspect in one glance.
- The `--json` result of `motio render` includes the output path, the codec, the number of rendered frames, the time taken, the FFmpeg used and the page's `renderWarnings`: a font that fell back to another one (`W_FONT_FALLBACK`), `Math.random()` in a frame (`W_MATH_RANDOM`), a `staticFile()` name whose case differs from the file (`W_STATIC_FILE_CASE`, which works on macOS and fails on a Linux runner), a `<TransitionSeries>` shorter than the composition (`W_TIMELINE_SHORT`).

## A CI job

The job needs Node, the project's dependencies and FFmpeg (`sudo apt-get install -y ffmpeg` on Ubuntu runners; pin a version, for example in a container image, when two runners must produce the same files). Chrome is downloaded on first use; cache `~/.cache/motio` between runs to skip the download.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm exec motio check determinism src/index.ts Intro --frames=0- --json > determinism.json
pnpm exec motio check flicker src/index.ts Intro --frames=0- --json > flicker.json
pnpm exec motio render src/index.ts Intro out/intro.mp4 --json > render.json
jq -e '.renderWarnings == null' render.json   # optional: fail on any page warning
```

`renderWarnings` is left out when the render had none, so the last line fails the job as soon as the page reported one.

Pixels are only expected to match on the same operating system, CPU architecture and Chrome build: compare renders made in CI with other renders made in CI, not with ones made on a laptop.
