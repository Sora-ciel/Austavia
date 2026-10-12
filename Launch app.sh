#!/usr/bin/env bash
# Linux counterpart of "Launch app.bat": runs the web app on
# http://localhost:5173 and opens it in the default browser.
#
# Double-clicked in the file manager there is no terminal, so nothing would
# show the server or let you stop it; reopen in Konsole first. Closing that
# window stops the server.
cd "$(dirname "$0")" || exit 1
if [ ! -t 1 ] && command -v konsole >/dev/null; then
  exec konsole -e "$0" "$@"
fi

npm run dev -- --open
read -rp "Server stopped. Press Enter to close..."
