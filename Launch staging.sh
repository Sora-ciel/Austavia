#!/usr/bin/env bash
# Linux counterpart of "Launch staging.bat": runs the app against the
# arial-staging Firebase project on http://localhost:5174, beside a normal
# "Launch app.sh" on 5173. --strictPort in the npm script makes a port clash
# fail loudly rather than quietly moving to the next port, which is how you
# end up signed into production while believing you are on staging.
cd "$(dirname "$0")" || exit 1
if [ ! -t 1 ] && command -v konsole >/dev/null; then
  exec konsole -e "$0" "$@"
fi

# Without .env.staging the app silently falls back to the production config in
# firebase.ts, so refuse to start rather than let that happen.
if [ ! -f .env.staging ]; then
  echo
  echo "  .env.staging is missing, so this would run against PRODUCTION."
  echo
  echo "  Recreate it with:"
  echo "    firebase apps:sdkconfig web --project staging"
  echo
  read -rp "Press Enter to close..."
  exit 1
fi

echo
echo "  Arial - STAGING  (project arial-staging)"
echo "  http://localhost:5174"
echo
echo "  Notes, themes and uploads here go to the staging project."
echo "  Nothing you do in this window touches real users' data."
echo

npm run dev:staging -- --open
read -rp "Server stopped. Press Enter to close..."
