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

# --staging: "Arial Staging", pointed at the arial-staging project, for
# trying a pre-release (asked 2026-10-26). Its own name, identifier and binary
# (src-tauri/tauri.staging.conf.json), so it installs beside the real app and
# keeps its own local data. Built from .env.staging; the tests run first.
if [ "${1:-}" = "--staging" ]; then
  npx tauri build --bundles deb --config src-tauri/tauri.staging.conf.json
else
  npx tauri build --bundles deb
fi

echo
echo "Output folder:"
echo "  src-tauri/target/release/bundle/deb/"
