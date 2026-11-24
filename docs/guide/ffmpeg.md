# FFmpeg

Motio captures frames in Chrome and hands them to FFmpeg, which encodes the video and mixes the audio. Any FFmpeg 5.1 or later works, as long as it has the encoders of the codecs you render; libx264 is enough for the default MP4.

## Which FFmpeg a render uses

In this order:

1. `ffmpegExecutable` (and `ffprobeExecutable`) passed to a [Node API](rendering-node.md) call;
2. the `MOTIO_FFMPEG` (and `MOTIO_FFPROBE`) environment variables;
3. `@motiojs/ffmpeg`, when the project installs it (coming soon, see below);
4. `ffmpeg` and `ffprobe` on `PATH`.

`motio doctor` reports which one it found, its version and, for each codec, the encoder it would use. A render checks the version and the encoders it needs before opening any browser tab, so a missing encoder fails at once with `E_FFMPEG_ENCODER_MISSING` and the encoder's name. The `--json` result of `motio render` records the path, version and source of the FFmpeg that encoded the video.

## The system FFmpeg

```bash
brew install ffmpeg          # macOS
sudo apt install ffmpeg      # Debian, Ubuntu
```

Both builds have every encoder in the table below. Distributions differ in versions and options, so two machines with different FFmpeg builds can produce slightly different files.

## The pinned FFmpeg (coming soon)

`@motiojs/ffmpeg` will make every render use the same FFmpeg 8.1.3 build on every machine of a platform (macOS and Linux, arm64 and x64; not Windows yet), with every encoder Motio uses: downloaded on first use into `~/.cache/motio/ffmpeg`, checked against a SHA-256 written in the package, and never downloaded again. It is meant for CI and render servers, where the system FFmpeg is old, missing or different from your machine's.

The package is in the repository, but the archives it downloads are not published yet, so do not install it for now: use the system FFmpeg above, or point `MOTIO_FFMPEG` at the build you want. This page will say when it can be installed.

The binaries will be GPL-licensed builds of FFmpeg. Motio runs them as a separate program, so they do not change the licence of your project or of your videos; if you redistribute the binaries yourself (inside a container image, for example), the GPL's conditions for distributing them apply. The [package README](../../packages/ffmpeg/README.md) has the details and the source of every library.

## Codecs

| `--codec` | Output extensions | FFmpeg encoder | CRF range (default) | Transparency | Audio |
|---|---|---|---|---|---|
| `h264` (default) | `.mp4`, `.mkv`, `.mov` | libx264 | 1 to 51 (18) | no | AAC (default), MP3 |
| `h264-mkv` | `.mkv` | libx264 | 1 to 51 (18) | no | AAC, MP3, Opus, PCM |
| `h264-ts` | `.ts` | libx264 | 1 to 51 (18) | no | AAC, MP3 |
| `h265` | `.mp4`, `.mkv`, `.hevc` (muted) | libx265 | 0 to 51 (23) | no | AAC, MP3 |
| `vp8` | `.webm` | libvpx | 4 to 63 (9) | `yuva420p` | Opus |
| `vp9` | `.webm` | libvpx-vp9 | 0 to 63 (28) | `yuva420p` | Opus |
| `av1` | `.mp4`, `.mkv` | libsvtav1, else libaom-av1 | 0 to 63 (30) | no | AAC, MP3 |
| `prores` | `.mov`, `.mkv` | prores_ks | none; `--prores-profile` | `yuva444p10le` with profile `4444` or `4444-xq` | PCM, AAC |
| `gif` | `.gif` | gif | none | no | none |
| `mp3`, `aac`, `wav` | `.mp3`; `.aac`, `.m4a`, `.m4b`, `.3gp`; `.wav` | libmp3lame, aac, pcm | none | | |

- **Output extension**: the first extension in the table is the codec's own, used when there is no output path. Any other must be listed for the codec, and it chooses the container: `--codec=h264` to `intro.mov` writes H.264 in a QuickTime file, to `intro.mkv` in Matroska. An extension that does not fit, such as `--codec=vp9` to `intro.mp4`, fails before anything renders with `E_INVALID_OPTION`, naming the extensions the codec takes and the codecs that write the one you gave. The same rule applies to `renderMedia()` and to chunked renders. An `.hevc` file holds the bare video stream, so it needs `--muted`.
- **CRF**: lower is better quality and a bigger file. For VP9 and AV1, CRF 0 is lossless.
- **Transparency**: render with `--image-format=png` and an alpha pixel format, for example `--codec=vp9 --pixel-format=yuva420p`, and leave the composition's background transparent.
- **AV1**: SVT-AV1 3.0 or later is preferred; with an older SVT-AV1 Motio uses libaom when FFmpeg has it, because SVT-AV1 2.x damaged blocks of some frames in testing.
- **GIF**: the palette is built from the whole video in a separate pass. `--every-nth-frame=2` keeps every other frame, halving the frame rate; `--number-of-gif-loops` sets how often it repeats (unset loops forever).
- **Colour**: every video codec is encoded as BT.709, limited range, with explicit conversion and tags, so colours match across players. `--color-space` also accepts `bt601` and `bt2020-ncl`.
