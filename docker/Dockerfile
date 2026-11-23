# Pinned render and test image: the reference environment for determinism goldens (D-005, D-012).
# Same image, same architecture => identical decoded frames. arm64 and amd64 never match each other.
FROM node:24-trixie-slim

ARG TARGETARCH
ARG CHROME_VERSION=158.0.8127.36
ARG CHROME_SHA256_ARM64=176ee5c55486c22de43128871189061365ea28e881fc96016fd18e7cb59437c8
ARG CHROME_SHA256_AMD64=2d3a23017323c54fd457a678e4351f895c4076d8050e39d5aa6247f93448b73a

# FFmpeg from Debian trixie, chrome-headless-shell runtime libraries, a fixed font set so text
# never depends on the host, and procps (pgrep) for the tests that check child processes.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates curl unzip procps \
      libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 \
      libcairo2 libdbus-1-3 libexpat1 libx11-6 libxcb1 libxext6 \
      fonts-dejavu-core fonts-liberation2 fonts-noto-core fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

RUN set -eu; \
    case "$TARGETARCH" in \
      arm64) platform=linux-arm64; sha="$CHROME_SHA256_ARM64" ;; \
      amd64) platform=linux64; sha="$CHROME_SHA256_AMD64" ;; \
      *) echo "unsupported arch $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    curl -fsSLo /tmp/chs.zip "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/${platform}/chrome-headless-shell-${platform}.zip"; \
    echo "$sha  /tmp/chs.zip" | sha256sum -c -; \
    mkdir -p /opt/chrome-headless-shell; \
    unzip -q /tmp/chs.zip -d /opt/chrome-headless-shell; \
    rm /tmp/chs.zip; \
    ln -s "/opt/chrome-headless-shell/chrome-headless-shell-${platform}/chrome-headless-shell" /usr/local/bin/chrome-headless-shell; \
    chrome-headless-shell --version

RUN corepack enable && corepack prepare pnpm@11.29.0 --activate

# Docker's default seccomp profile blocks the user namespaces Chrome's sandbox needs; the container
# is the isolation boundary, so the renderer passes --no-sandbox when this is set.
ENV MOTIO_BROWSER_EXECUTABLE=/usr/local/bin/chrome-headless-shell \
    MOTIO_CHROME_NO_SANDBOX=1
WORKDIR /work

# Chrome refuses to run as root without --no-sandbox; keep the sandbox and run as the node user.
USER node
