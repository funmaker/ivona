# Ivona

Janusz V2 text to speech service.

## Disclaimer

- Files in `vox/Black Mesa Announcement` belong to Valve.
- Files in `vox/Space Station 13` belong to SS13 creators.

## BonziBuddy voice (SAPI 4, Linux)

The `Bonzi` provider runs the L&H TruVoice SAPI 4 engine under Wine through a small
Rust helper (`sapi4/`). To set it up you need `wine` and `cargo` with the 32-bit Windows target:

```bash
rustup target add i686-pc-windows-msvc
sapi4/setup.sh [path to WSAPI4 archive]
```

This downloads the SAPI 4 runtime and TruVoice installers from the
[WSAPI4 archive](https://github.com/LouisGameDev/Microsoft-Sam-Mary-Mike-TruVoice-WSAPI4)
(or uses a local copy), creates a Wine prefix in `sapi4/prefix` with them installed,
and installs the helper into it. Set `SAPI4_PREFIX` to use a different location
(eg. when running from `dist`), and `WINE_BIN`/`WINESERVER_BIN` to use different Wine binaries.
The provider is skipped if the prefix is missing.

## Yukkuri voices (AquesTalk10, Linux)

The `AquesTalk` provider uses the AquesTalk10 Linux SDK through a small Rust helper (`aquestalk/`).
Its license does not allow redistribution, so it is downloaded by the setup script
(`unzip`, `curl` and `cargo` are required):

```bash
aquestalk/setup.sh [path to aqtk10_lnx_110.zip]
```

This installs the library and helper into `aquestalk/install` (`AQUESTALK_DIR` to change it).
Text is converted to kana with [kuromoji](https://github.com/takuyaa/kuromoji.js), numbers and
latin text are read with AquesTalk's reading tags.

Without a development license key AquesTalk runs as the evaluation version, which pronounces
the ナ and マ rows as ヌ. Set `AQUESTALK_DEV_KEY` (and optionally `AQUESTALK_USR_KEY`) to
use a license.

## Docker

The image runs both setup scripts during the build, which download the SAPI 4 installers and
AquesTalk10:

```bash
docker build -t ivona .
docker run -p 3939:80 ivona
```

## Usage

### Run development

```bash
npm run start
```

### Build production

```bash
npm run build:prod
```

### Start production

```bash
npm run start:prod
```
