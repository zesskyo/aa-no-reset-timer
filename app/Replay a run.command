#!/bin/bash
# Double-click to play back a run that's already done (from the stats site, or a play.log), to see how the splits behave.
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "AA Live needs Node.js. Install it from https://nodejs.org (the LTS one), then double-click this again."
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi
echo "Which run? Type its number on your stats site (like 27), or drag a play.log onto this window, then press Return:"
read -r RUN
RUN="${RUN%" "}"; RUN="${RUN//\\ / }"; RUN="${RUN#\"}"; RUN="${RUN%\"}"; RUN="${RUN#\'}"; RUN="${RUN%\'}"
node aa-live.mjs --replay "$RUN" "$@"
