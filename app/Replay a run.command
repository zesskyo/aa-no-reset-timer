#!/bin/bash
# Double-click to play back a run that's already done (from your stats site, or a play.log), to see how the splits behave.
cd "$(dirname "$0")"
source ./find-node.sh
echo "Which run? Type its number on your stats site (like 27), or drag a play.log onto this window, then press Return:"
read -r RUN
RUN="${RUN%" "}"; RUN="${RUN//\\ / }"; RUN="${RUN#\"}"; RUN="${RUN%\"}"; RUN="${RUN#\'}"; RUN="${RUN%\'}"
"$NODE" aa-live.mjs --replay "$RUN" "$@"
