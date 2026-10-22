# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Ivona ("Janusz V2") is an Express + TypeScript text-to-speech HTTP service. It wraps several unrelated TTS engines behind one API, and two of them run through small Rust helper binaries.

## Commands

```bash
npm run start          # dev: webpack watch + HMR, runs build/server.js (port 3939)
npm run build:prod     # builds into dist/ (server bundle, static/, vox/, trimmed package.json, configs.json)
npm run start:prod     # cd dist && npm start
npm run lint           # eslint, --max-warnings 0
npm run lint-fix
```

There is no test suite. To check a change, run the dev server and hit `/tts?text=...&voice=...`, `/list`, or `/`.

Native helpers (optional; the provider skips itself if they are missing):

```bash
sapi4/setup.sh [WSAPI4 archive]          # needs wine + cargo with i686-pc-windows-msvc target; creates sapi4/prefix
aquestalk/setup.sh [aqtk10_lnx_110.zip]  # needs curl, unzip, cargo; installs into aquestalk/install
docker build -t ivona . && docker run -p 3939:80 ivona   # image runs both setups
```

## Architecture

- `server.ts` creates the HTTP server and hot-swaps `server/app` on HMR. Port and host come from `configs.json` (read from the CWD at runtime) and are overridden by `PORT` and `HOST`.
- `server/routes/index.ts` has `GET /tts` (returns WAV), `/list` (voices), `/language` (stub), and `/`, which renders the `server/views/index.handlebars` page. Templates are imported as modules through `handlebars-loader`. Routes use `express-promise-router`, so a thrown `HTTPError(code, publicMessage)` turns into a JSON error response.
- `server/controllers/speech.ts` is the core:
  - It builds the provider list based on the platform: `Sapi5` on win32, `Sapi4` on non-win32, `AquesTalk` on linux, and `Vox` everywhere. List order matters, because the first matching voice wins.
  - Each provider's `init()` runs asynchronously at startup. If one fails, the error is logged and that provider simply has no voices.
  - `synthesise()` matches the `voice`, `provider`, and `language` query params by case-insensitive substring/prefix. If none are given, it auto-detects the language with `languagedetect`.
  - Results are cached as `cache/<md5(provider+voice+text)>.wav`. `tmp/` holds scratch files.
- Providers in `server/providers/` extend `base.ts`. Each one fills `this.voices` in `init()` and implements `synthesise(voice, text) => Promise<Buffer>` returning WAV.
  - `sapi5.ts`: Windows SAPI5 voices (IVONA 2 etc.) through the forked `say` package. It holds a voice→language map.
  - `vox.ts`: concatenates word samples from `vox/<voice name>/<word>.wav|ogg`. Every subdirectory is a voice. Samples are decoded to PCM at startup with ffmpeg.
  - `sapi4.ts`: SAPI4 voices (BonziBuddy via TruVoice, Microsoft Sam) under Wine. Voices map to SAPI4 mode names with fixed pitch/speed in `VOICES`. It calls `C:\sapi4.exe` inside the `SAPI4_PREFIX` Wine prefix (`list` / `speak <mode> <pitch> <speed> <out>`, text on stdin) and keeps a persistent `wineserver`. Japanese text is romanized first.
  - `aquestalk.ts`: Yukkuri voices. `toKoe()` converts arbitrary text into an AquesTalk phonetic string (kana morae, `<NUMK>`/`<ALPHA>` tags, limited punctuation, at most 80-mora phrases) using kuromoji, then pipes it to the `aquestalk` helper, which writes WAV to stdout.
- `server/helpers/ffmpeg.ts` `runFFmpeg(args, input)` always outputs to stdout. It uses `FFMPEG_BIN`, then `bin/ffmpeg.exe` on Windows, then `ffmpeg-static`, then `ffmpeg` on PATH. `japanese.ts` provides the shared kuromoji tokenizer and romanization.
- `sapi4/` is a `#![no_std]` 32-bit Windows Rust binary (raw-dylib, linked with rust-lld, see `.cargo/config.toml`). Its interface definitions come from SAPI 4 `speech.h`. `aquestalk/` is a Linux Rust binary that `dlopen`s `libAquesTalk10.so` and reads `AQUESTALK_DEV_KEY`/`AQUESTALK_USR_KEY`.

## Conventions

- Style is enforced by `.eslintrc.json`: 2-space indent, blank lines keep their indentation (`indent-empty-lines`), no space after `if(`/`for(`, and trailing commas on multiline literals. Lint fails on any warning.
- Each provider logs with its own `log()` helper and a colored `[Name]` prefix via chalk.
- Child processes (ffmpeg, wine, aquestalk) follow the same spawn pattern: collect stdout/stderr buffers, use a `finished` guard, and reject with stderr details.
