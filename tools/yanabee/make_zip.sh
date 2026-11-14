#!/usr/bin/env bash
# Build the Cloudflare Pages zip of the Yanabee site (the owner uploads it by hand; never auto-deploy).
#   bash tools/yanabee/make_zip.sh OUT.zip [STAGE_DIR]
# - copies site/yanabee into a staging folder (the repo is not touched)
# - 404.html: /yanabee/ absolute paths become / (the zip is served at the domain root)
# - js/yb-config.js: the LIVE backend (project URL + publishable key). Both are public by design: the
#   database policies protect the data. The repo keeps the empty config (the tests rely on it).
#   NEVER put a service_role / secret key here.
set -euo pipefail
OUT="${1:?usage: make_zip.sh OUT.zip [STAGE_DIR]}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGE="${2:-$(mktemp -d)}"
YB_URL="${YB_URL:-https://dhjmdiqausbcyhrguinl.supabase.co}"
YB_KEY="${YB_KEY:-sb_publishable_gBua_7P2rfKsH6lOdfOFKg_7oHYSFHs}"

case "$YB_KEY" in sb_secret_*|*service_role*) echo "refusing: a secret key must never ship in the site" >&2; exit 1;; esac

rm -rf "$STAGE/site"
mkdir -p "$STAGE/site"
cp -r "$ROOT/site/yanabee/." "$STAGE/site/"
sed -i 's#/yanabee/#/#g' "$STAGE/site/404.html"
cat > "$STAGE/site/js/yb-config.js" <<EOF
/* Yanabee backend connection (Supabase), written by tools/yanabee/make_zip.sh for the deployed site.
   The publishable key is public by design: it only opens what the database policies allow.
   NEVER put the service_role key here or anywhere else in the site. */
window.YB_CONFIG = { url: '$YB_URL', anonKey: '$YB_KEY' };
EOF

if grep -q '/yanabee/' "$STAGE/site/404.html"; then echo "404.html still has /yanabee/ paths" >&2; exit 1; fi
# the app's service worker: its version follows the files actually shipped (the live config included), so phones
# that installed the app replace their saved copies after every upload
if [ -f "$STAGE/site/sw.js" ]; then
  V="$(cd "$STAGE/site" && find . -type f ! -name sw.js -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -c1-12)"
  sed -i "s/^const VERSION = '[^']*';/const VERSION = 'z$V';/" "$STAGE/site/sw.js"
  grep -q "^const VERSION = 'z$V';" "$STAGE/site/sw.js" || { echo "sw.js version not stamped" >&2; exit 1; }
fi
rm -f "$OUT"
(cd "$STAGE/site" && zip -qr -X "$OUT" .)
echo "zip: $OUT ($(unzip -l "$OUT" | tail -1 | awk '{print $2}') files)"
echo "stage: $STAGE/site"
