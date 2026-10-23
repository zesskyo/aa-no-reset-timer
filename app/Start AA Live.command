#!/bin/bash
# Double-click to start AA Live (the splits open in your browser). Close this window to stop it.
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "AA Live needs Node.js. Install it from https://nodejs.org (the LTS one), then double-click this again."
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi
node aa-live.mjs "$@"
