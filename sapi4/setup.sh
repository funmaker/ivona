#!/usr/bin/env bash
# Creates a Wine prefix with the SAPI 4 runtime, L&H TruVoice and Microsoft voices installed,
# and builds the sapi4.exe helper into it (C:\sapi4.exe).
#
# Usage: sapi4/setup.sh [path to WSAPI4 archive]
#   Without a path, the installers are downloaded from $WSAPI4_URL (and checked against their known checksums).
#   Creates the prefix in $SAPI4_PREFIX, or sapi4/prefix by default.
#   Set $SAPI4_EXE to use a prebuilt sapi4.exe instead of building it.
#
# Requires: wine, cargo with the i686-pc-windows-msvc target (rustup target add i686-pc-windows-msvc),
#           curl (when downloading)

set -euo pipefail

WSAPI4_URL="${WSAPI4_URL:-https://github.com/LouisGameDev/Microsoft-Sam-Mary-Mike-TruVoice-WSAPI4/raw/main}"
declare -A WSAPI4_SHA256=(
	[spchapi.exe]=8955ee03217bc2539e2f80e58f51d30aa97e7512d96592f098133c8036e363dd
	[tv_enua.exe]=709936902951fb684d0a03a561fb7fd41c5e6f81ecd60d326809db66eb659331
	[msttsl.exe]=c87f9a489e53d250cb4ed5574af243c35db1a859e2a266e2d9d0d3b241513d5e
)

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export WINEPREFIX="$(realpath -m "${SAPI4_PREFIX:-$DIR/prefix}")"
export WINEDEBUG=-all
# Skip the Mono/Gecko install prompts
export WINEDLLOVERRIDES="mscoree,mshtml="

TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT

if [[ -n "${1:-}" ]]; then
	ARCHIVE="$(realpath "$1")"
	for installer in "${!WSAPI4_SHA256[@]}"; do
		[[ -f "$ARCHIVE/$installer" ]] || { echo "Missing $ARCHIVE/$installer" >&2; exit 1; }
	done
else
	ARCHIVE="$TEMP"
	for installer in "${!WSAPI4_SHA256[@]}"; do
		echo "Downloading $installer from $WSAPI4_URL..."
		curl -fL --retry 3 -o "$ARCHIVE/$installer" "$WSAPI4_URL/$installer"
		echo "${WSAPI4_SHA256[$installer]}  $ARCHIVE/$installer" | sha256sum -c --quiet - || { echo "Checksum mismatch for $WSAPI4_URL/$installer" >&2; exit 1; }
	done
fi

if [[ -z "${SAPI4_EXE:-}" ]]; then
	echo "Building sapi4.exe..."
	(cd "$DIR" && cargo build --release)
	SAPI4_EXE="$DIR/target/i686-pc-windows-msvc/release/sapi4.exe"
fi

echo "Creating Wine prefix in $WINEPREFIX..."
wineboot -i
# SAPI audio objects need a window; the null driver allows that without a display server
wine reg add 'HKCU\Software\Wine\Drivers' /v Graphics /d null /f >/dev/null

echo "Installing SAPI 4 runtime..."
# IExpress installers: quiet, no reboot. Their exit code is unreliable, so the result is checked below.
wine "$ARCHIVE/spchapi.exe" /Q:A /R:N || true
echo "Installing TruVoice voices..."
wine "$ARCHIVE/tv_enua.exe" /Q:A /R:N || true
echo "Installing Microsoft voices..."
wine "$ARCHIVE/msttsl.exe" /Q:A /R:N || true

cp "$SAPI4_EXE" "$WINEPREFIX/drive_c/sapi4.exe"
wineserver -w

echo "Installed voices:"
VOICES="$(wine 'C:\sapi4.exe' list 2>/dev/null | tee /dev/stderr)"
grep -q "TruVoice" <<<"$VOICES" || { echo "TruVoice voices were not installed" >&2; exit 1; }
grep -q "^Sam"$'\t' <<<"$VOICES" || { echo "Microsoft voices were not installed" >&2; exit 1; }
echo "Done."
