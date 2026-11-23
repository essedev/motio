# Rendering from the CLI

The `motio` command comes with `@motiojs/cli`, a development dependency of every project. Run it through the package manager (`pnpm exec motio`, `npx motio`) or from the package.json scripts. `motio --help` lists the commands and `motio <command> --help` every flag.

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

Without an output, the video goes to `out/<composition-id>` with the codec's extension. Without `--codec`, the extension picks it: `.mp4` H.264, `.webm` VP8, `.mov` ProRes, `.mkv` H.264 in Matroska, `.ts` H.264 in MPEG-TS, `.gif` GIF, `.mp3`, `.aac`/`.m4a` and `.wav` audio only.

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
| `--width`, `--height`, `--fps`, `--duration` | Override the composition's metadata for this render. |
| `--sequence` | Write an image sequence into the output directory instead of a video. |
| `--chunks`, `--frames-per-chunk` | Render in chunks in parallel processes and join them without re-encoding. |

A render prints its progress on stderr and, with `--json`, one JSON object on stdout with the output path, codec, rendered frames, time taken and the FFmpeg used.

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

0 success, 1 error, 2 invalid arguments, 3 a check found problems (`check determinism`, `check flicker`, `doctor`). Errors carry a stable code, such as `E_COMPOSITION_NOT_FOUND` or `E_READINESS_TIMEOUT`, in the message and in the `--json` output.
