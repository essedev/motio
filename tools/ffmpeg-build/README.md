# FFmpeg builds for @motiojs/ffmpeg

Reproducible build scripts for the FFmpeg and ffprobe that `@motiojs/ffmpeg` downloads (D-065). Every source is pinned in `sources.lock` and verified before it is used; every library is built from source as a static library; the result is one archive per platform with the binaries, `LICENSE.md`, the licence texts and `BUILDINFO.json`.

| File | Role |
|---|---|
| `sources.lock` | Every source: official tarballs with their SHA-256, git sources with the pinned commit. |
| `build.env` | FFmpeg version, build number, macOS deployment target, the pinned Alpine image. |
| `fetch-sources.sh DEST` | Downloads and verifies every source; archives git sources at their commit (`git archive`), so builds and the release use plain tarballs; writes `DEST/SHA256SUMS`. |
| `build.sh SOURCES WORK OUT` | Builds on macOS (natively, or `TARGET_ARCH=x86_64` to cross-compile the Intel build on Apple Silicon) and inside the Linux image; checks encoders, decoders, HTTPS, linkage, and encodes a one-second smoke test with every encoder. |
| `build-linux.sh ARCH SOURCES OUT` | Runs `build.sh` in `Dockerfile` (Alpine, musl: fully static binaries) for `arm64` or `amd64`; a foreign architecture runs under emulation. |
| `package.sh` | Called by `build.sh`: packs `ffmpeg-<version>-<build>-<platform>.tar.gz` and appends its digest to `OUT/SHA256SUMS`. |
| `update-manifest.mjs DIR` | Writes the digest and size of the archives in `DIR` into `packages/ffmpeg/src/manifest.ts`. |
| `../../.github/workflows/ffmpeg-build.yml` | Builds every platform on GitHub Actions and, when asked, creates a draft release with everything below. |

## Build locally

```bash
tools/ffmpeg-build/fetch-sources.sh ~/motio-ffmpeg/sources
tools/ffmpeg-build/build.sh ~/motio-ffmpeg/sources ~/motio-ffmpeg/work-darwin-arm64 tools/ffmpeg-build/out
TARGET_ARCH=x86_64 tools/ffmpeg-build/build.sh ~/motio-ffmpeg/sources ~/motio-ffmpeg/work-darwin-x64 tools/ffmpeg-build/out
tools/ffmpeg-build/build-linux.sh arm64 ~/motio-ffmpeg/sources tools/ffmpeg-build/out
tools/ffmpeg-build/build-linux.sh amd64 ~/motio-ffmpeg/sources tools/ffmpeg-build/out
node tools/ffmpeg-build/update-manifest.mjs tools/ffmpeg-build/out
```

macOS needs the Xcode command line tools, `cmake`, `ninja` and `meson` (or `uv`, which runs a pinned meson); x86_64 builds build the pinned nasm when none is installed. `tools/ffmpeg-build/out/` is ignored by git: archives are never committed. `packages/ffmpeg/src/release-archive.integration.test.ts` installs the local archive of the current platform through a local HTTP server and renders with it.

## What a release contains

The workflow's release job (and anyone publishing by hand) attaches:

- the archives and `SHA256SUMS`;
- `sources/`: the exact source tarball of every entry in `sources.lock` (the git sources as archived by `fetch-sources.sh`) and `SOURCES-SHA256SUMS`;
- `ffmpeg-build-scripts.tar.gz`: this folder at the commit that built the archives;
- the licence texts (`LICENSE.md` and `licenses/` from an archive).

That is the complete corresponding source the GPL asks for, next to the binaries.

## Changing a pin

Edit `sources.lock` (and `build.env` for FFmpeg's version), bump `BUILD` in `build.env` when the FFmpeg version stays the same, rebuild every platform, run `update-manifest.mjs`, and bump `FFMPEG_VERSION`/`FFMPEG_BUILD` in the manifest to match. The archives are not byte-reproducible across machines (compiler versions, timestamps in static libraries), so the manifest must always carry the digests of the archives that are actually published.
