# Finds Node.js for AA Live: the one installed, or else a copy of its own in app/node, downloaded from nodejs.org the
# first time (checked against nodejs.org's checksums). Sets NODE to it. (Used by the other .command files.)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
NODE=node
if ! command -v node >/dev/null 2>&1; then
  NODE="$PWD/node/bin/node"
  if [ ! -x "$NODE" ]; then
    echo "Node.js isn't installed, so AA Live is downloading its own copy (about 45 MB, only this once)…"
    V=v22.11.0; A=$(uname -m); [ "$A" = "x86_64" ] && A=x64
    NAME="node-$V-darwin-$A"; TMP=$(mktemp -d)
    if curl -fL --progress-bar "https://nodejs.org/dist/$V/$NAME.tar.gz" -o "$TMP/$NAME.tar.gz" \
      && curl -fsL "https://nodejs.org/dist/$V/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt" \
      && (cd "$TMP" && grep " $NAME.tar.gz\$" SHASUMS256.txt | shasum -a 256 -c - >/dev/null) \
      && mkdir -p node && tar -xzf "$TMP/$NAME.tar.gz" -C node --strip-components 1; then
      echo "Done."
    else
      rm -rf node
      echo "Couldn't download Node.js. Install it from https://nodejs.org (the LTS one), then double-click this again."
      read -n 1 -s -r -p "Press any key to close."; exit 1
    fi
    rm -rf "$TMP"
  fi
fi
