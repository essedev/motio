#!/bin/sh
# Builds a self-contained FFmpeg and ffprobe from the tarballs fetch-sources.sh verified.
#
#   tools/ffmpeg-build/build.sh SOURCES WORK OUT
#
# SOURCES  directory filled by fetch-sources.sh
# WORK     scratch directory (sources are unpacked and built here; reused across runs)
# OUT      where the archive lands (package.sh)
#
# Runs natively on macOS (arm64 or x86_64, Xcode command line tools, cmake, ninja, uv or meson)
# and inside the Alpine image of Dockerfile on Linux, where the result is fully static (musl).
# TARGET_ARCH=x86_64 on an Apple Silicon Mac cross-compiles the darwin-x64 build (Rosetta runs
# its checks). x86_64 builds need nasm: the pinned one in sources.lock is built when none is on
# PATH. Every library is built from source as a static library; FFmpeg is configured with
# --disable-autodetect so nothing on the build machine leaks into the binary.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
src=${1:?usage: build.sh SOURCES WORK OUT}
work=${2:?usage: build.sh SOURCES WORK OUT}
out=${3:?usage: build.sh SOURCES WORK OUT}
mkdir -p "$work" "$out"
src=$(cd "$src" && pwd)
work=$(cd "$work" && pwd)
out=$(cd "$out" && pwd)
. "$here/build.env"

os=$(uname -s)
host_arch=$(uname -m)
arch=${TARGET_ARCH:-$host_arch}
cross=""
if [ "$arch" != "$host_arch" ]; then
	if [ "$os-$host_arch-$arch" != Darwin-arm64-x86_64 ]; then
		echo "error: cross-compiling $host_arch to $arch on $os is not supported" >&2
		exit 1
	fi
	cross=1
fi
case "$os-$arch" in
Darwin-arm64) platform=darwin-arm64 ;;
Darwin-x86_64) platform=darwin-x64 ;;
Linux-aarch64) platform=linux-arm64 ;;
Linux-x86_64) platform=linux-x64 ;;
*)
	echo "error: unsupported build target $os $arch" >&2
	exit 1
	;;
esac

prefix="$work/prefix"
build="$work/build"
rm -rf "$prefix" "$build"
mkdir -p "$prefix/lib/pkgconfig" "$prefix/include" "$build"

# Only our own .pc files: Homebrew's or the distribution's must never be found.
export PKG_CONFIG_LIBDIR="$prefix/lib/pkgconfig"
unset PKG_CONFIG_PATH
export PATH="$prefix/bin:$PATH"
jobs=$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu)

# Flags for CMake and autotools when cross-compiling (empty for native builds).
cmake_cross=""
host_flag=""
if [ "$os" = Darwin ]; then
	export MACOSX_DEPLOYMENT_TARGET="$MACOS_DEPLOYMENT_TARGET"
	export CC=clang CXX=clang++
	export CFLAGS="-O2 -arch $arch -mmacosx-version-min=$MACOS_DEPLOYMENT_TARGET"
	export LDFLAGS="-arch $arch -mmacosx-version-min=$MACOS_DEPLOYMENT_TARGET"
	if [ -n "$cross" ]; then
		cmake_cross="-DCMAKE_SYSTEM_NAME=Darwin -DCMAKE_SYSTEM_PROCESSOR=$arch -DCMAKE_OSX_ARCHITECTURES=$arch"
		host_flag="--host=$arch-apple-darwin --build=aarch64-apple-darwin"
	fi
else
	export CC=gcc CXX=g++
	export CFLAGS="-O2 -fPIC"
	export LDFLAGS=""
fi
export CXXFLAGS="$CFLAGS"

if command -v meson >/dev/null 2>&1; then
	meson() { command meson "$@"; }
else
	meson() { uvx --from meson==1.9.1 meson "$@"; }
fi

unpack() {
	# unpack NAME: extracts the tarball of NAME from sources.lock into $build/NAME, prints the dir.
	line=$(grep -v '^#' "$here/sources.lock" | awk -v n="$1" '$1 == n')
	version=$(echo "$line" | awk '{print $2}')
	kind=$(echo "$line" | awk '{print $3}')
	url=$(echo "$line" | awk '{print $4}')
	case "$kind" in
	tar) file="$src/$(basename "$url")" ;;
	git) file="$src/$1-$version.tar.gz" ;;
	esac
	mkdir -p "$build/$1"
	tar -xf "$file" -C "$build/$1" --strip-components 1
	echo "$build/$1"
}

step() { printf '\n=== %s ===\n' "$*"; }

if [ "$arch" = x86_64 ] && ! command -v nasm >/dev/null 2>&1; then
	step nasm
	d=$(unpack nasm)
	# A build tool: compiled for the host, never linked into FFmpeg.
	(cd "$d" && CFLAGS="-O2" LDFLAGS="" ./configure --prefix="$work/tools" && make -j"$jobs" &&
		make install)
	export PATH="$work/tools/bin:$PATH"
fi

if [ "$os" = Linux ]; then
	step zlib
	d=$(unpack zlib)
	(cd "$d" && ./configure --static --prefix="$prefix" && make -j"$jobs" && make install)
fi

step x264
d=$(unpack x264)
# shellcheck disable=SC2086
(cd "$d" && ./configure --prefix="$prefix" $host_flag --enable-static --enable-pic --disable-cli \
	--disable-opencl --bit-depth=all && make -j"$jobs" && make install)

step x265
# 8-bit and 10-bit in one static library, as x265's own multilib script does (minus 12-bit, which
# no Motio pixel format uses).
d=$(unpack x265)
x265_flags="-G Ninja -DCMAKE_BUILD_TYPE=Release -DENABLE_SHARED=OFF -DENABLE_CLI=OFF \
-DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_OSX_DEPLOYMENT_TARGET=${MACOSX_DEPLOYMENT_TARGET:-} \
$cmake_cross"
# shellcheck disable=SC2086
cmake -S "$d/source" -B "$d/b10" $x265_flags -DHIGH_BIT_DEPTH=ON -DEXPORT_C_API=OFF
cmake --build "$d/b10" -j "$jobs"
mkdir -p "$d/b8"
ln -sf "$d/b10/libx265.a" "$d/b8/libx265_main10.a"
# shellcheck disable=SC2086
cmake -S "$d/source" -B "$d/b8" $x265_flags -DCMAKE_INSTALL_PREFIX="$prefix" \
	-DCMAKE_INSTALL_LIBDIR=lib -DEXTRA_LIB=x265_main10.a "-DEXTRA_LINK_FLAGS=-L$d/b8" \
	-DLINKED_10BIT=ON
cmake --build "$d/b8" -j "$jobs"
cmake --install "$d/b8"
mv "$d/b8/libx265.a" "$d/b8/libx265_main.a"
if [ "$os" = Darwin ]; then
	libtool -static -o "$prefix/lib/libx265.a" "$d/b8/libx265_main.a" "$d/b10/libx265.a"
else
	printf 'CREATE %s\nADDLIB %s\nADDLIB %s\nSAVE\nEND\n' "$prefix/lib/libx265.a" \
		"$d/b8/libx265_main.a" "$d/b10/libx265.a" | ar -M
fi
if [ "$os" = Linux ]; then
	# CMake lists the compiler's implicit libraries in x265.pc, including the shared libgcc_s,
	# which a fully static link cannot use (libgcc and libgcc_eh cover it).
	sed -i 's/-lgcc_s//g' "$prefix/lib/pkgconfig/x265.pc"
fi

step svt-av1
d=$(unpack svtav1)
# shellcheck disable=SC2086
cmake -S "$d" -B "$d/out" -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$prefix" \
	-DCMAKE_INSTALL_LIBDIR=lib -DBUILD_SHARED_LIBS=OFF -DBUILD_APPS=OFF -DBUILD_TESTING=OFF \
	-DCMAKE_OSX_DEPLOYMENT_TARGET="${MACOSX_DEPLOYMENT_TARGET:-}" $cmake_cross
cmake --build "$d/out" -j "$jobs"
cmake --install "$d/out"

step libvpx
d=$(unpack libvpx)
vpx_target=""
if [ "$os" = Darwin ] && [ "$arch" = arm64 ]; then vpx_target="--target=arm64-darwin23-gcc"; fi
if [ "$os" = Darwin ] && [ "$arch" = x86_64 ]; then vpx_target="--target=x86_64-darwin23-gcc"; fi
(cd "$d" && ./configure --prefix="$prefix" $vpx_target --enable-static --disable-shared \
	--enable-pic --enable-vp8 --enable-vp9 --enable-vp9-highbitdepth --disable-examples \
	--disable-tools --disable-docs --disable-unit-tests && make -j"$jobs" && make install)

step dav1d
d=$(unpack dav1d)
meson_cross=""
if [ -n "$cross" ]; then
	printf '%s\n' "[binaries]" "c = ['clang', '-arch', '$arch']" \
		"cpp = ['clang++', '-arch', '$arch']" "ar = 'ar'" "strip = 'strip'" "nasm = 'nasm'" "" \
		"[host_machine]" "system = 'darwin'" "cpu_family = '$arch'" "cpu = '$arch'" \
		"endian = 'little'" >"$work/meson-cross.txt"
	meson_cross="--cross-file=$work/meson-cross.txt"
fi
# shellcheck disable=SC2086
meson setup "$d/out" "$d" --buildtype=release --default-library=static --prefix="$prefix" \
	--libdir=lib -Denable_tools=false -Denable_tests=false -Denable_examples=false $meson_cross
meson compile -C "$d/out"
meson install -C "$d/out"

step opus
d=$(unpack opus)
# shellcheck disable=SC2086
(cd "$d" && ./configure --prefix="$prefix" $host_flag --enable-static --disable-shared \
	--disable-doc --disable-extra-programs && make -j"$jobs" && make install)

step lame
d=$(unpack lame)
lame_host="$host_flag"
if [ -z "$cross" ] && { [ "$arch" = arm64 ] || [ "$arch" = aarch64 ]; }; then
	# LAME's 2017 config.guess does not know arm64 hosts.
	lame_host="--build=aarch64-unknown-$([ "$os" = Darwin ] && echo darwin || echo linux-gnu)"
fi
(cd "$d" && CFLAGS="$CFLAGS -Wno-error=implicit-function-declaration" ./configure \
	--prefix="$prefix" $lame_host --enable-static --disable-shared --disable-frontend \
	--disable-decoder --disable-gtktest && make -j"$jobs" && make install)

step mbedtls
d=$(unpack mbedtls)
# shellcheck disable=SC2086
cmake -S "$d" -B "$d/out" -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$prefix" \
	-DCMAKE_INSTALL_LIBDIR=lib -DENABLE_TESTING=OFF -DENABLE_PROGRAMS=OFF \
	-DUSE_SHARED_MBEDTLS_LIBRARY=OFF -DUSE_STATIC_MBEDTLS_LIBRARY=ON \
	-DCMAKE_POSITION_INDEPENDENT_CODE=ON $cmake_cross
cmake --build "$d/out" -j "$jobs"
cmake --install "$d/out"

step ffmpeg
d=$(unpack ffmpeg)
static=""
if [ "$os" = Linux ]; then static="--extra-ldexeflags=-static"; fi
if [ -n "$cross" ]; then
	static="--enable-cross-compile --arch=$arch --target-os=darwin --cc=clang --cxx=clang++ \
--extra-cflags=-arch --extra-cflags=$arch --extra-cxxflags=-arch --extra-cxxflags=$arch \
--extra-ldflags=-arch --extra-ldflags=$arch"
fi
# --enable-version3 is required by mbedTLS (Apache-2.0 or GPL-2.0+, listed by FFmpeg as LGPLv3/
# GPLv3 compatible): the binaries are GPL-3.0-or-later.
configure_flags="--prefix=$prefix --pkg-config-flags=--static --extra-cflags=-I$prefix/include \
--extra-ldflags=-L$prefix/lib $static --enable-gpl --enable-version3 --disable-autodetect \
--enable-pthreads --enable-zlib --enable-libx264 --enable-libx265 --enable-libsvtav1 --enable-libvpx \
--enable-libdav1d --enable-libopus --enable-libmp3lame --enable-mbedtls --disable-ffplay \
--disable-doc --disable-debug"
# shellcheck disable=SC2086
(cd "$d" && ./configure $configure_flags && make -j"$jobs" && make install)

step check
ff="$prefix/bin/ffmpeg"
"$ff" -hide_banner -version | head -1
encoders=$("$ff" -hide_banner -encoders)
for e in libx264 libx265 libsvtav1 libvpx libvpx-vp9 libopus aac prores_ks png mjpeg libmp3lame pcm_s16le gif; do
	echo "$encoders" | grep -q " $e " || {
		echo "error: encoder $e missing" >&2
		exit 1
	}
done
decoders=$("$ff" -hide_banner -decoders)
for c in libdav1d h264 hevc vp8 vp9 prores png mjpeg aac mp3 opus; do
	echo "$decoders" | grep -q " $c " || {
		echo "error: decoder $c missing" >&2
		exit 1
	}
done
"$ff" -hide_banner -protocols | grep -q '^ *https$' || {
	echo "error: https protocol missing" >&2
	exit 1
}
if [ "$os" = Darwin ]; then
	otool -L "$ff"
	if otool -L "$ff" | tail -n +2 | grep -v -e /usr/lib/ -e /System/Library/; then
		echo "error: links a library outside the system" >&2
		exit 1
	fi
else
	if file "$ff" | grep -q dynamically; then
		echo "error: not statically linked: $(file "$ff")" >&2
		exit 1
	fi
fi

# A one-second smoke test of every encoder Motio uses.
t="$work/smoke"
rm -rf "$t" && mkdir -p "$t"
in="-f lavfi -i testsrc2=s=320x240:r=30:d=1 -f lavfi -i sine=d=1:sample_rate=48000"
# shellcheck disable=SC2086
{
	"$ff" -v error $in -c:v libx264 -pix_fmt yuv420p -c:a aac "$t/a.mp4"
	"$ff" -v error $in -c:v libsvtav1 -pix_fmt yuv420p -c:a aac "$t/b.mp4"
	"$ff" -v error $in -c:v libvpx-vp9 -c:a libopus "$t/c.webm"
	"$ff" -v error $in -c:v libvpx -c:a libopus "$t/d.webm"
	"$ff" -v error $in -c:v prores_ks -c:a pcm_s16le "$t/e.mov"
	"$ff" -v error $in -c:v libx264 -c:a libmp3lame "$t/f.mkv"
	"$ff" -v error $in -c:v libx265 -pix_fmt yuv420p10le -c:a aac "$t/g.mp4"
	"$ff" -v error -i "$t/b.mp4" -f null -
	[ "$("$prefix/bin/ffprobe" -v error -select_streams v -show_entries stream=pix_fmt -of csv=p=0 "$t/g.mp4")" = yuv420p10le ]
}
echo "smoke test passed"

printf '%s' "$configure_flags" >"$work/configure-flags.txt"
"$here/package.sh" "$platform" "$prefix" "$build" "$src" "$work/configure-flags.txt" "$out"
