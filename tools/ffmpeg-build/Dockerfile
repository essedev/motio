# Build environment of the Linux @motiojs/ffmpeg binaries: Alpine (musl), so the result is fully
# static and runs on any Linux of the same architecture. The image digest is pinned in build.env
# and passed as ALPINE_IMAGE; the toolchain comes from that Alpine release's packages.
ARG ALPINE_IMAGE
FROM ${ALPINE_IMAGE}
RUN apk add --no-cache build-base cmake ninja meson nasm pkgconf perl python3 coreutils \
      linux-headers bash file tar xz gzip bzip2 diffutils
WORKDIR /build
