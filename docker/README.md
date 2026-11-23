# Render and test image

The reference environment for determinism: pinned chrome-headless-shell (verified by SHA-256), Debian trixie FFmpeg, a fixed font set. Goldens that assert cross-machine identity are valid only in this image, per architecture (arm64 and amd64 never match each other).

```bash
docker build -t motio-env docker/
# Test a clean copy of a commit: never mount the host's node_modules (native binaries differ).
mkdir -p /tmp/motio-work && git archive HEAD | tar -x -C /tmp/motio-work
docker run --rm -v /tmp/motio-work:/work -w /work motio-env bash -lc \
  'pnpm install --frozen-lockfile && pnpm build && pnpm test:integration'
```

Inside the image the renderer captures with BeginFrame (D-033); `MOTIO_CAPTURE_METHOD=screenshot` forces the reference path.

`MOTIO_BROWSER_EXECUTABLE` points the renderer at the image's browser.
