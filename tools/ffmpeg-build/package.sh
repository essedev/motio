#!/bin/sh
# Packs one build into OUT/ffmpeg-<version>-<build>-<platform>.tar.gz with its licences and a
# BUILDINFO.json, and appends the archive's SHA-256 to OUT/SHA256SUMS. Called by build.sh.
#
#   package.sh PLATFORM PREFIX BUILD_DIR SOURCES CONFIGURE_FLAGS_FILE OUT
set -eu

here=$(cd "$(dirname "$0")" && pwd)
platform=$1 prefix=$2 build=$3 src=$4 flags_file=$5 out=$6
. "$here/build.env"

name="ffmpeg-$FFMPEG_VERSION-$BUILD-$platform"
stage=$(mktemp -d)
root="$stage/$name"
mkdir -p "$root/bin" "$root/licenses"
cp "$prefix/bin/ffmpeg" "$prefix/bin/ffprobe" "$root/bin/"

lic() {
	# lic NAME FILE...: copies licence files of a source tree as licenses/NAME-FILE.
	n=$1
	shift
	for f in "$@"; do
		cp "$build/$n/$f" "$root/licenses/$n-$(echo "$f" | tr / -)"
	done
}
lic ffmpeg LICENSE.md COPYING.GPLv3 COPYING.GPLv2 COPYING.LGPLv3 COPYING.LGPLv2.1
lic x264 COPYING
lic x265 COPYING
lic svtav1 LICENSE.md LICENSE-BSD2.md PATENTS.md third_party/fastfeat/LICENSE \
	third_party/safestringlib/LICENSE
lic libvpx LICENSE PATENTS AUTHORS
lic dav1d COPYING
lic opus COPYING
lic lame COPYING LICENSE
lic mbedtls LICENSE
case "$platform" in
linux-*)
	lic zlib LICENSE
	mkdir -p "$build/musl"
	tar -xzf "$src/musl-1.2.6.tar.gz" -C "$build/musl" --strip-components 1
	lic musl COPYRIGHT
	;;
esac

sha256() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | cut -d' ' -f1
	else
		shasum -a 256 "$1" | cut -d' ' -f1
	fi
}

cat >"$root/LICENSE.md" <<EOF
# Licence of these binaries

\`bin/ffmpeg\` and \`bin/ffprobe\` are FFmpeg $FFMPEG_VERSION, built for $platform by Motio's build
scripts. Because they include x264 and x265 (GPL-2.0-or-later) and are configured with \`--enable-gpl
--enable-version3\` (required by mbedTLS), the binaries as a whole are licensed under the
**GNU General Public License, version 3 or later** (\`licenses/ffmpeg-COPYING.GPLv3\`).

Statically linked libraries and their licences, in \`licenses/\`:

| Library | Licence |
|---|---|
| FFmpeg $FFMPEG_VERSION | LGPL-2.1-or-later, GPL with --enable-gpl (\`ffmpeg-LICENSE.md\`) |
| x264 | GPL-2.0-or-later |
| x265 | GPL-2.0-or-later |
| SVT-AV1 | BSD-3-Clause-Clear and the Alliance for Open Media Patent License 1.0 (\`svtav1-PATENTS.md\`); bundled third-party code under BSD-2-Clause and MIT-style licences |
| libvpx | BSD-3-Clause and the WebM patent grant (\`libvpx-PATENTS\`) |
| dav1d | BSD-2-Clause |
| Opus | BSD-3-Clause |
| LAME | LGPL-2.0-or-later |
| Mbed TLS | Apache-2.0 OR GPL-2.0-or-later |
EOF
case "$platform" in
linux-*)
	cat >>"$root/LICENSE.md" <<EOF
| zlib | zlib licence |
| musl libc (Alpine package) | MIT |

The GCC runtime support code (libgcc) linked by the compiler is covered by the GCC Runtime Library
Exception.
EOF
	;;
*)
	cat >>"$root/LICENSE.md" <<EOF

zlib and the C library come from macOS itself and are linked dynamically.
EOF
	;;
esac
cat >>"$root/LICENSE.md" <<EOF

## Source code

The complete corresponding source is published with the same GitHub Release as this archive: the
exact source tarball of every library above, \`SHA256SUMS\` for them, and the build scripts
(\`tools/ffmpeg-build/\` in the Motio repository) that turn them into this archive.
\`BUILDINFO.json\` lists every source with its digest and FFmpeg's configure flags.

Using these binaries to render videos does not change the licence of Motio (Apache-2.0), of your
project or of the videos you make: Motio runs FFmpeg as a separate program.
EOF

if [ "$(uname -s)" = Darwin ]; then
	compiler=$(clang --version | head -1)
else
	compiler=$(gcc --version | head -1)
fi
{
	printf '{\n'
	printf '  "ffmpegVersion": "%s",\n' "$FFMPEG_VERSION"
	printf '  "build": %s,\n' "$BUILD"
	printf '  "platform": "%s",\n' "$platform"
	printf '  "licence": "GPL-3.0-or-later",\n'
	printf '  "compiler": "%s",\n' "$compiler"
	if [ "$(uname -s)" = Darwin ]; then
		printf '  "macosDeploymentTarget": "%s",\n' "$MACOS_DEPLOYMENT_TARGET"
	else
		printf '  "image": "%s",\n' "$ALPINE_IMAGE"
	fi
	printf '  "configure": "%s",\n' "$(sed "s|$prefix|PREFIX|g" "$flags_file")"
	printf '  "sources": [\n'
	first=1
	grep -v '^#' "$here/sources.lock" | while read -r n version kind url digest; do
		[ -n "${n:-}" ] || continue
		case "$kind" in tar) f=$(basename "$url") ;; git) f="$n-$version.tar.gz" ;; esac
		[ $first = 1 ] || printf ',\n'
		first=0
		printf '    { "name": "%s", "version": "%s", "kind": "%s", "url": "%s", "pinned": "%s", "archive": "%s", "sha256": "%s" }' \
			"$n" "$version" "$kind" "$url" "$digest" "$f" "$(sha256 "$src/$f")"
	done
	printf '\n  ]\n}\n'
} >"$root/BUILDINFO.json"

archive="$out/$name.tar.gz"
if [ "$(uname -s)" = Darwin ]; then
	COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs --uid 0 --gid 0 -cf - -C "$stage" "$name" |
		gzip -n -9 >"$archive.part"
else
	tar --owner=0 --group=0 --numeric-owner --sort=name -cf - -C "$stage" "$name" |
		gzip -n -9 >"$archive.part"
fi
mv "$archive.part" "$archive"
rm -rf "$stage"

digest=$(sha256 "$archive")
touch "$out/SHA256SUMS"
grep -v " $name.tar.gz\$" "$out/SHA256SUMS" >"$out/SHA256SUMS.part" || true
printf '%s  %s\n' "$digest" "$name.tar.gz" >>"$out/SHA256SUMS.part"
mv "$out/SHA256SUMS.part" "$out/SHA256SUMS"
echo "packed $archive ($(wc -c <"$archive" | tr -d ' ') bytes, sha256 $digest)"
