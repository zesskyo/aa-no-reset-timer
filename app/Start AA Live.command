#!/bin/bash
# Double-click to start AA Live (the splits open in your browser). Close this window to stop it.
cd "$(dirname "$0")"
source ./find-node.sh
"$NODE" aa-live.mjs "$@"
