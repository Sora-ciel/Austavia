#!/usr/bin/env bash
# Linux counterpart of build_tauri.bat: builds the .deb installer.
# System libraries needed once:
#   sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
#     libayatana-appindicator3-dev libssl-dev build-essential patchelf file
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x node_modules/.bin/vite ]; then
  echo "Vite not found - installing deps..."
  npm install --include=dev
fi

npx tauri build --bundles deb

echo
echo "Output folder:"
echo "  src-tauri/target/release/bundle/deb/"
