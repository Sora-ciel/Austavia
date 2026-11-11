#!/usr/bin/env bash
# Linux counterpart of build_tauri.bat: builds the .deb installer, or the
# Windows setup .exe.
# System libraries needed once:
#   sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
#     libayatana-appindicator3-dev libssl-dev build-essential patchelf file
# And for --windows:
#   sudo apt install nsis lld llvm clang
#   rustup target add x86_64-pc-windows-msvc
#   cargo install --locked cargo-xwin --version 0.19.2   (the last for rustc 1.87)
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x node_modules/.bin/vite ]; then
  echo "Vite not found - installing deps..."
  npm install --include=dev
fi

# --staging: "Arial Staging", pointed at the arial-staging project, for
# trying a pre-release (asked 2026-10-26). Its own name, identifier and binary
# (src-tauri/tauri.staging.conf.json), so it installs beside the real app and
# keeps its own local data. Built from .env.staging; the tests run first.
#
# --windows: the Windows setup .exe, built here rather than on Windows (asked
# 2026-11-11), so a release is made from one place. Only the NSIS .exe -- an
# .msi can only be made on Windows. cargo-xwin fetches Microsoft's Windows SDK
# and runtime to build against; using them means accepting Microsoft's
# licence for them, which Sora did on 2026-11-11 (XWIN_ACCEPT_LICENSE).
staging=0
windows=0
for arg in "$@"; do
  case "$arg" in
    --staging) staging=1 ;;
    --windows) windows=1 ;;
  esac
done

config=()
if [ "$staging" = 1 ]; then config=(--config src-tauri/tauri.staging.conf.json); fi

if [ "$windows" = 1 ]; then
  # Not --bundles nsis: on Linux the CLI only takes Linux kinds there, so the
  # kind is given through the config instead.
  XWIN_ACCEPT_LICENSE=1 npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc \
    "${config[@]}" --config '{"bundle":{"targets":["nsis"]}}'
  echo
  echo "Output folder:"
  echo "  src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/"
else
  npx tauri build --bundles deb "${config[@]}"
  echo
  echo "Output folder:"
  echo "  src-tauri/target/release/bundle/deb/"
fi
