# Render and test image

The reference environment for determinism: pinned chrome-headless-shell (verified by SHA-256), Debian trixie FFmpeg, a fixed font set. Goldens that assert cross-machine identity are valid only in this image, per architecture (arm64 and amd64 never match each other).

```bash
docker build -t motio-env docker/
# Test a clean copy of a commit: never mount the host's node_modules (native binaries differ).
mkdir -p /tmp/motio-work && git archive HEAD | tar -x -C /tmp/motio-work
docker run --rm -v /tmp/motio-work:/work -w /work motio-env bash -lc \
  'pnpm install --frozen-lockfile && pnpm build && pnpm test:integration'
```

Inside the image the renderer captures with `Page.captureScreenshot`, as everywhere (D-043); `MOTIO_CAPTURE_METHOD=begin-frame` selects BeginFrame (D-033).

## BeginFrame identity tests

`packages/motio/src/begin-frame.integration.test.ts` checks that BeginFrame capture gives the same decoded frames as screenshots on every fixture composition (D-013, D-033). Chrome supports BeginFrame on Linux only, so on macOS those tests are skipped and the run prints why; on Linux a failed BeginFrame probe fails the run instead of skipping. Run them in the image:

```bash
mkdir -p /tmp/motio-work && git archive HEAD | tar -x -C /tmp/motio-work
docker run --rm -v /tmp/motio-work:/work -w /work motio-env bash -lc \
  'pnpm install --frozen-lockfile && pnpm build && pnpm vitest run --project integration packages/motio/src/begin-frame.integration.test.ts'
```

Goldens recorded on macOS (Remotion's stills, D-041) are not expected to match in the image; the BeginFrame, frame-stamp, determinism, colour, codec, media and chunked-render tests are.

`MOTIO_BROWSER_EXECUTABLE` points the renderer at the image's browser.
