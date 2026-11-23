#!/bin/sh
# Downloads every source in sources.lock into DEST and verifies it.
#
#   tools/ffmpeg-build/fetch-sources.sh DEST
#
# Tarballs are checked against their pinned SHA-256. Git sources are fetched at the pinned commit,
# checked, and archived with `git archive` to DEST/<name>-<version>.tar.gz, so every build reads
# plain tarballs and the release can ship the exact source it was built from (GPL corresponding
# source). DEST/SHA256SUMS lists the digest of every tarball in DEST.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
dest=${1:?usage: fetch-sources.sh DEST}
mkdir -p "$dest"
dest=$(cd "$dest" && pwd)

sha256() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | cut -d' ' -f1
	else
		shasum -a 256 "$1" | cut -d' ' -f1
	fi
}

fetch_tar() {
	name=$1 version=$2 url=$3 digest=$4
	file="$dest/$(basename "$url")"
	if [ ! -f "$file" ] || [ "$(sha256 "$file")" != "$digest" ]; then
		echo "fetch $name $version: $url"
		curl -fsSL --retry 3 -o "$file.part" "$url"
		mv "$file.part" "$file"
	fi
	actual=$(sha256 "$file")
	if [ "$actual" != "$digest" ]; then
		echo "error: $file has SHA-256 $actual, expected $digest" >&2
		rm -f "$file"
		exit 1
	fi
	echo "ok    $name $version $(basename "$file")"
}

fetch_git() {
	name=$1 version=$2 url=$3 commit=$4
	file="$dest/$name-$version.tar.gz"
	stamp="$file.commit"
	if [ -f "$file" ] && [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$commit" ]; then
		echo "ok    $name $version (archived from $commit)"
		return
	fi
	work=$(mktemp -d)
	echo "fetch $name $version: $url @ $commit"
	git -C "$work" init -q
	git -C "$work" remote add origin "$url"
	if ! git -C "$work" fetch -q --depth 1 origin "$commit" 2>/dev/null; then
		# Servers that refuse fetching a bare commit: fetch everything, then check it out.
		git -C "$work" fetch -q --tags origin
	fi
	git -C "$work" -c advice.detachedHead=false checkout -q "$commit"
	actual=$(git -C "$work" rev-parse HEAD)
	if [ "$actual" != "$commit" ]; then
		echo "error: $name checked out $actual, expected $commit" >&2
		exit 1
	fi
	git -C "$work" archive --format=tar --prefix="$name-$version/" HEAD | gzip -n -9 >"$file.part"
	mv "$file.part" "$file"
	echo "$commit" >"$stamp"
	rm -rf "$work"
	echo "ok    $name $version (archived from $commit)"
}

grep -v '^#' "$here/sources.lock" | while read -r name version kind url digest; do
	[ -n "${name:-}" ] || continue
	case "$kind" in
	tar) fetch_tar "$name" "$version" "$url" "$digest" ;;
	git) fetch_git "$name" "$version" "$url" "$digest" ;;
	*)
		echo "error: unknown kind $kind for $name" >&2
		exit 1
		;;
	esac
done

grep -v '^#' "$here/sources.lock" | while read -r name version kind url digest; do
	[ -n "${name:-}" ] || continue
	case "$kind" in
	tar) f=$(basename "$url") ;;
	git) f="$name-$version.tar.gz" ;;
	esac
	printf '%s  %s\n' "$(sha256 "$dest/$f")" "$f"
done >"$dest/SHA256SUMS"
echo "wrote $dest/SHA256SUMS"
