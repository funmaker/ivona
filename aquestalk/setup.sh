#!/usr/bin/env bash
# Installs the AquesTalk10 library and builds the aquestalk helper next to it.
#
# Usage: aquestalk/setup.sh [path to aqtk10_lnx_110.zip]
#   Without a path, the SDK is downloaded from $AQUESTALK_URL (and checked against its known checksum).
#   Installs into $AQUESTALK_DIR, or aquestalk/install by default.
#   Set $AQUESTALK_BIN to use a prebuilt helper instead of building it.
#
# The SDK license forbids redistributing it, so it is not included in the repository.
# Requires: unzip, cargo, curl (when downloading)

set -euo pipefail

# Original: https://www.a-quest.com/archive/package/aqtk10_lnx_110.zip
AQUESTALK_URL="${AQUESTALK_URL:-https://puu.sh/KUvEj/d76abe70f2.zip}"
AQUESTALK_SHA256="989e0c363f865923800e0e0b9d905d6e4a5164a6d0e142f73368055228bf979b"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL="$(realpath -m "${AQUESTALK_DIR:-$DIR/install}")"
LIBRARY=libAquesTalk10.so.1.1

case "$(uname -m)" in
	x86_64) ARCH=lib64 ;;
	i?86) ARCH=lib32 ;;
	*) echo "AquesTalk10 only supports x86 and x86_64" >&2; exit 1 ;;
esac

TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT

if [[ -n "${1:-}" ]]; then
	ZIP="$(realpath "$1")"
else
	echo "Downloading AquesTalk10 from $AQUESTALK_URL..."
	ZIP="$TEMP/aqtk10_lnx_110.zip"
	curl -fL --retry 3 -o "$ZIP" "$AQUESTALK_URL"
	echo "$AQUESTALK_SHA256  $ZIP" | sha256sum -c --quiet - || { echo "Checksum mismatch for $AQUESTALK_URL" >&2; exit 1; }
fi

if [[ -z "${AQUESTALK_BIN:-}" ]]; then
	echo "Building aquestalk..."
	(cd "$DIR" && cargo build --release)
	AQUESTALK_BIN="$DIR/target/release/aquestalk"
fi

echo "Installing AquesTalk10 into $INSTALL..."
mkdir -p "$INSTALL"
unzip -o -j -q "$ZIP" "aqtk10_lnx/$ARCH/$LIBRARY" -d "$INSTALL"
cp "$AQUESTALK_BIN" "$INSTALL/aquestalk"

echo "Testing..."
printf 'てすと。' | "$INSTALL/aquestalk" 0 100 100 100 100 100 100 > "$TEMP/test.wav"
[[ "$(head -c 4 "$TEMP/test.wav")" == "RIFF" ]] || { echo "AquesTalk10 does not work" >&2; exit 1; }
echo "Done."
