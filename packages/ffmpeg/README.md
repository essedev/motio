# @motiojs/ffmpeg

An optional, pinned FFmpeg and ffprobe for [Motio](../../README.md). Install it and every render uses the same FFmpeg build, with every encoder Motio needs, on every machine of the same platform:

```bash
pnpm add -D @motiojs/ffmpeg
motio ffmpeg ensure        # optional: download now instead of on the first render
```

Without this package, Motio uses the FFmpeg on your `PATH`, as before.

## What you get

FFmpeg 8.1.3 built from source by the scripts in [`tools/ffmpeg-build/`](../../tools/ffmpeg-build/), with:

- video: libx264 (H.264), libx265 (H.265, 8- and 10-bit), SVT-AV1 (AV1), libvpx (VP8, VP9), ProRes, GIF, PNG, MJPEG; dav1d to decode AV1;
- audio: AAC (FFmpeg's own), LAME (MP3), Opus, PCM;
- HTTPS input through Mbed TLS, for remote media.

| Platform | Archive |
|---|---|
| macOS arm64 (12 or later) | yes |
| macOS x64 (12 or later) | yes |
| Linux arm64 (static, any distribution) | yes |
| Linux x64 (static, any distribution) | yes |
| Windows x64 | not built yet |

`FFMPEG_ARCHIVES` in `src/manifest.ts` is the source of truth: a platform with `null` has no archive in this version, and `ensureFfmpeg()` fails there with `E_FFMPEG_UNSUPPORTED_PLATFORM`.

## How it works

Nothing is downloaded when the package is installed: there is no install script. On first use (a render, or `motio ffmpeg ensure`), `ensureFfmpeg()`:

1. downloads the archive of the current platform from the GitHub Release `ffmpeg-<version>-<build>` (or from `MOTIO_FFMPEG_BASE_URL`);
2. checks its size and SHA-256 against the manifest committed in this package, and discards it if they differ (`E_FFMPEG_DIGEST`);
3. unpacks it into a private temporary folder, runs `ffmpeg -version`, `ffmpeg -encoders` and `ffprobe -version`, and checks the version and every required encoder (`E_FFMPEG_VERIFY`);
4. moves the folder into `~/.cache/motio/ffmpeg/<version>-<build>/<platform>` with a single rename, so concurrent renders, in one process or several, either see a complete install or none.

Later calls return the cached install without touching the network.

## Which FFmpeg a render uses

The renderer and the CLI pick FFmpeg in this order:

1. `ffmpegExecutable` and `ffprobeExecutable` passed to the API call;
2. `MOTIO_FFMPEG` and `MOTIO_FFPROBE`;
3. this package, when it is installed in the project;
4. `ffmpeg` and `ffprobe` on `PATH`.

If this package is installed but its build cannot be downloaded (`E_FFMPEG_DOWNLOAD`, including archives that are not published, or `E_FFMPEG_UNSUPPORTED_PLATFORM`) and an `ffmpeg` on `PATH` runs, the renderer uses that one and adds `W_FFMPEG_FALLBACK` to the render's warnings. `E_FFMPEG_DIGEST` and `E_FFMPEG_VERIFY` are never papered over: the render fails.

`motio doctor` says which one it found and lists its encoders; the JSON result of `motio render` records the path, version and source of the FFmpeg that encoded the video. The package is looked up in the `node_modules` folders above the renderer and above the working directory; Yarn Plug'n'Play is not supported, use `MOTIO_FFMPEG` there.

## Keep using the system FFmpeg

Uninstall the package, or set `MOTIO_FFMPEG=ffmpeg` (or any path): the environment variable wins over the package.

## API

<!-- example: ../../docs/guide/examples/src/packages/ffmpeg.ts#api -->
```ts
import { ensureFfmpeg, findFfmpeg } from "@motiojs/ffmpeg";

const { ffmpeg, ffprobe, version, directory, downloaded } = await ensureFfmpeg({
	cacheDir: "/tmp/ffmpeg-cache", // default $MOTIO_FFMPEG_CACHE, else ~/.cache/motio/ffmpeg
	baseUrl: "https://mirror.example/ffmpeg", // default $MOTIO_FFMPEG_BASE_URL, else the release
	onProgress: ({ downloadedBytes, totalBytes }) =>
		console.log(`${downloadedBytes} of ${totalBytes} bytes`),
});
const installed = await findFfmpeg(); // never downloads; null when not installed yet
```

Errors are `FfmpegError` instances with a stable `code`: `E_FFMPEG_UNSUPPORTED_PLATFORM`, `E_FFMPEG_DOWNLOAD`, `E_FFMPEG_DIGEST`, `E_FFMPEG_VERIFY`.

A mirror only needs the archive files of the release under one URL: `MOTIO_FFMPEG_BASE_URL=https://mirror.example/ffmpeg` downloads `https://mirror.example/ffmpeg/ffmpeg-8.1.3-1-linux-x64.tar.gz`, and the pinned digest still applies.

## Licences

- **The JavaScript code of this package** is Apache-2.0, like the rest of Motio.
- **The FFmpeg binaries it downloads are GPL-licensed** (GPL-3.0-or-later as built: they include x264 and x265, which are GPL, and Mbed TLS, which FFmpeg accepts only with `--enable-version3`). They are separate programs: this package downloads them, it does not contain or link them.
- **Source code**: each GitHub Release that publishes the archives also publishes the exact source tarball of FFmpeg and of every library in them, their SHA-256, the build scripts and the licence texts. Each archive carries `LICENSE.md`, the licences of every library in `licenses/` and `BUILDINFO.json`, which lists every source with its digest and FFmpeg's configure flags.
- **Your project and your videos are not affected**: Motio runs FFmpeg as a separate process, so using these binaries does not change the licence of Motio, of your code or of the videos you render. If you redistribute the binaries yourself (for example inside a container image), the GPL's conditions for distributing them apply to you, as for any GPL program; pointing to the release that publishes their source is the simplest way to meet them.

The libraries and their licences: FFmpeg (LGPL-2.1-or-later, GPL as configured), x264 and x265 (GPL-2.0-or-later), SVT-AV1 (BSD-3-Clause-Clear with the Alliance for Open Media patent licence), libvpx (BSD-3-Clause with the WebM patent grant), dav1d (BSD-2-Clause), Opus (BSD-3-Clause), LAME (LGPL-2.0-or-later), Mbed TLS (Apache-2.0 or GPL-2.0-or-later), and on Linux zlib (zlib licence) and musl libc (MIT). See [NOTICE](NOTICE).
