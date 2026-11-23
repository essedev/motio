#!/bin/sh
# Builds the Linux binaries for one architecture in Docker.
#
#   tools/ffmpeg-build/build-linux.sh ARCH SOURCES OUT     (ARCH: arm64 or amd64)
#
# The build directory is a Docker volume (motio-ffmpeg-work-ARCH), not a host folder: on Docker
# Desktop a parallel build on a bind mount lost object files between the compiler and `ar`.
# A foreign architecture runs under emulation (QEMU or Rosetta), which is much slower.
# BUILD_CPUS limits the container's CPUs (docker run --cpus).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
arch=${1:?usage: build-linux.sh ARCH SOURCES OUT}
src=${2:?} out=${3:?}
mkdir -p "$src" "$out"
src=$(cd "$src" && pwd) out=$(cd "$out" && pwd)
. "$here/build.env"
image="motio-ffmpeg-build:$BUILD-$arch"
docker build --platform "linux/$arch" --build-arg "ALPINE_IMAGE=$ALPINE_IMAGE" -t "$image" "$here"
docker run --rm --platform "linux/$arch" ${BUILD_CPUS:+--cpus "$BUILD_CPUS"} \
	-v "$here:/scripts:ro" -v "$src:/sources:ro" -v "motio-ffmpeg-work-$arch:/work" -v "$out:/out" \
	"$image" sh /scripts/build.sh /sources /work /out
