#!/usr/bin/env bash
# Copies the static site into www/, which is Capacitor's webDir. There's no
# bundler for this project - index.html/css/js are the real source of truth -
# so this is just a plain file copy, not a build. Run before `cap sync ios`
# (also wired as `npm run ios:sync`, which runs this first).
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf www
mkdir -p www
cp index.html privacy.html terms.html manifest.json sw.js www/
cp -R css www/css
cp -R js www/js
if [ -d assets ]; then cp -R assets www/assets; fi

echo "Synced site into www/ for Capacitor."
