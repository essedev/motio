# Rendering from the CLI

The `motio` command comes with `@motiojs/cli`, a development dependency of every project. Run it through the package manager (`pnpm exec motio`, `npx motio`) or from the package.json scripts. `motio --help` lists the commands, `motio <command> --help` every flag, and `motio --version` prints the version. A mistyped command or flag is refused with the closest valid one: `motio rendr` asks "Did you mean motio render?", `--frame` on `motio render` "Did you mean --frames?".

## Videos

```bash
motio render [entry-point] <composition-id> [output]
```

```bash
pnpm exec motio render src/index.ts Intro                      # out/Intro.mp4, H.264
pnpm exec motio render src/index.ts Intro out/intro.webm       # VP8, from the extension
pnpm exec motio render src/index.ts Intro out/intro.mp4 --codec=av1 --crf=35
pnpm exec motio render src/index.ts Intro out/part.mp4 --frames=0-59
pnpm exec motio render src/index.ts Intro out/intro.mp3        # the audio only
```

Without an output, the video goes to `out/<composition-id>` with the codec's extension. Without `--codec`, the extension picks it: `.mp4` H.264, `.webm` VP8, `.mov` ProRes, `.mkv` H.264 in Matroska, `.ts` H.264 in MPEG-TS, `.gif` GIF, `.mp3`, `.aac`/`.m4a` and `.wav` audio only. With `--codec`, the extension must be one the codec can be written to, and it names the container: `--codec=h264` to `out/intro.mov` writes H.264 in a MOV file, while `--codec=vp9` to `out/intro.mp4` is refused before rendering (the table in [FFmpeg](ffmpeg.md#codecs) lists the extensions of each codec). An extension no codec writes, such as `.avi`, is refused with the list of supported ones.

| Flag | Meaning |
|---|---|
| `--codec` | `h264`, `h265`, `vp8`, `vp9`, `av1`, `prores`, `gif`, `h264-mkv`, `h264-ts`, `mp3`, `aac`, `wav`. See the table in [FFmpeg](ffmpeg.md). |
| `--crf` | Quality: lower is better and bigger. The range and default depend on the codec. |
| `--frames` | Render part of the video: `30`, `0-59`, `100-` (to the end). |
| `--props` | Props as JSON, or the path to a JSON file. |
| `--scale` | Multiplies the output size: `--scale=0.5` renders a 1920x1080 composition at 960x540. |
| `--concurrency` | Browser tabs rendering in parallel: a number or a percentage of the CPU threads. Default: half the threads, at most 8. |
| `--every-nth-frame` | Renders every nth frame, for quick previews and GIFs. |
| `--muted` | No audio. |
| `--image-format` | How frames are captured: `jpeg` (default, faster) or `png` (needed for transparency). |
| `--pixel-format` | For example `yuva420p` with VP8/VP9 or `yuva444p10le` with ProRes for a transparent video. |
| `--prores-profile` | `4444-xq`, `4444`, `hq` (default), `standard`, `light`, `proxy`. |
| `--audio-codec`, `--audio-bitrate` | Override the codec's default audio (AAC at 320k for MP4). |
| `--timeout` | How long a `delayRender()` handle may hold a frame, in milliseconds (default 30000). |
| `--raster` | `cpu` (default) or `gpu`: whose pixels a render reproduces, Remotion's default setting or Remotion with `gl: "swangle"`, which selects `gpu` by itself. `gpu` makes videos about 2.5 times slower. See [Raster and canvas](configuration.md#raster-and-canvas). |
| `--canvas` | `software` (default) or `gpu`: how transparent captures draw 2D canvases, deterministic and faster, or as Remotion does. See [Raster and canvas](configuration.md#raster-and-canvas). |
| `--time-zone` | The time zone of the page's `Date` and `Intl`, such as `Europe/Rome` (default: `UTC` on every machine). See [Time zone and language](frames-and-time.md#time-zone-and-language). |
| `--locale` | The page's language (`navigator.language`, `Intl`'s default locale, `Accept-Language`), such as `it-IT` (default: `en-US` on every machine). See [Time zone and language](frames-and-time.md#time-zone-and-language). |
| `--width`, `--height`, `--fps`, `--duration` | Override the composition's metadata for this render. |
| `--sequence` | Write an image sequence into the output directory instead of a video: PNG files named after the pattern `frame-[frame].[ext]`, the frame zero-padded to the digits of the last one (`frame-00.png` to `frame-89.png` for 90 frames). `--image-format=jpeg`, `--image-sequence-pattern` and the config file's settings change them. `--frames=0,30,60`, a list of single frames, also writes a sequence. |
| `--chunks`, `--frames-per-chunk` | Render in chunks in parallel processes and join them without re-encoding. |

The flags that describe the project rather than one run (the codec, the quality, the image format, the raster, the time zone and language, the timeout) can be set once in `motio.config.ts` at the project root, which every command reads, and machine settings such as the concurrency also from `MOTIO_*` variables (`MOTIO_CONCURRENCY`, `MOTIO_TIMEOUT`). A flag wins over both. The composition, the output, `--frames` and `--props` stay flags. See [Configuration](configuration.md) for every key.

A render prints its progress on stderr and, with `--json`, one JSON object on stdout with the output path, codec, rendered frames, time taken and the FFmpeg used.

### What a render tells you on the way

- **Warnings** from the page are printed once each, with the first frame they were seen on, and listed in `renderWarnings` of the `--json` result:

  ```text
  warning [W_MATH_RANDOM]: Math.random() was called while a frame rendered. ... (frame 0)
  ```

  The codes: `W_FONT_FALLBACK` (text fell back to another font), `W_MATH_RANDOM` (a frame called `Math.random()`), `W_STATIC_FILE_CASE` (a `staticFile()` name differs in case from the file in `public/`), `W_TIMELINE_SHORT` (a `<TransitionSeries>` ends before the composition), `W_SLOW_READINESS` (a `delayRender()` handle stayed open more than half its timeout), `W_ANIMATION_UNSEEKABLE` (a CSS or Web Animation that cannot follow the frame, such as one on a scroll timeline), `W_CSS_TRANSITION` (in the frame model, a CSS transition shown at its end, see [Frames and time](frames-and-time.md#why-frames-and-not-time)), `W_ANIMATION_FRAME_LOOP` (in the frame model, a `requestAnimationFrame` loop on the real clock, see [Code that reads the clock](frames-and-time.md#code-that-reads-the-clock)), `W_TIMER_LOOP` (in the frame model, a `setTimeout` chain or an interval on the real clock) and `W_FFMPEG_FALLBACK` (see [FFmpeg](ffmpeg.md)).
- **Waiting**: while a `delayRender()` handle holds a frame, a line every 5 seconds says which one and for how long, so a long wait is not silent:

  ```text
  Waiting on delayRender("Waiting for the API") at frame 0 of Intro: 5/30 s (--timeout=<ms> raises the limit).
  ```

- **Errors** say where they happened: the frame, the composition and, for an error thrown by your code, the file, line and column, mapped from the bundle back to the source and relative to the working directory, so a terminal can open it:

  ```text
  error [E_RENDER_ERROR]: boom
    at frame 5 of Intro, src/Intro.tsx:20:29
  ```

  A missing file in `public/` fails at once with `E_ASSET_NOT_FOUND` (an image, a video) or `E_FONT_LOAD` (a font), its path, and the closest file name when there is one: `Did you mean staticFile("logo.svg")?`.

## Stills

```bash
pnpm exec motio still src/index.ts Thumbnail out/thumbnail.png
pnpm exec motio still src/index.ts Intro out/frame.jpg --frame=45
pnpm exec motio still src/index.ts Intro out/last.png --frame=-1
```

`motio still` renders one frame of any composition (frame 0 by default; negative frames count from the end) as PNG (default), JPEG, WebP or PDF, from the extension or `--image-format`.

## Contact sheets

```bash
pnpm exec motio frames src/index.ts Intro out/sheet.png --count=16
```

A grid of evenly spaced frames in one PNG, to check a whole video at a glance or hand it to a reviewer (or an AI agent) that cannot watch videos.

## Listing compositions

```bash
pnpm exec motio compositions src/index.ts --json
```

## Exit codes

0 success, 1 error, 2 invalid input, 3 a check found problems (`check determinism`, `check flicker`, `doctor`). Every invalid input exits with 2, whichever part of Motio noticed it: an unknown command or flag, a value out of range, an output extension that does not fit, a composition id that does not exist (`E_INVALID_ARGUMENT`, `E_INVALID_OPTION`, `E_UNSUPPORTED_OPTION`, `E_UNSUPPORTED_CODEC`, `E_COMPOSITION_REQUIRED`, `E_COMPOSITION_NOT_FOUND`). Errors carry a stable code, such as `E_READINESS_TIMEOUT`, in the message and in the `--json` output.
