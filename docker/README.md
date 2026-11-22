# Render and test image

The reference environment for determinism: pinned chrome-headless-shell (verified by SHA-256), Debian trixie FFmpeg, a fixed font set. Goldens that assert cross-machine identity are valid only in this image, per architecture (arm64 and amd64 never match each other).

```bash
docker build -t motio-env docker/
docker run --rm -v "$PWD":/work -w /work motio-env bash -lc 'pnpm install --frozen-lockfile && pnpm test:integration'
```

`MOTIO_BROWSER_EXECUTABLE` points the renderer at the image's browser.
