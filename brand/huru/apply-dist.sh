#!/bin/sh
# Rebrands a built frontend (vite build output) in place: page title, PWA manifest, the service
# worker's default notification title and the icons. Upstream's source files stay untouched.
# Usage: sh brand/huru/apply-dist.sh <dist dir>   (APP_NAME and APP_DESCRIPTION may be set)
set -eu
DIST=${1:?dist dir}
HERE=$(cd "$(dirname "$0")" && pwd)
NAME=${APP_NAME:-Huru GYM}
DESC=${APP_DESCRIPTION:-Workout and body-weight tracker that plans your progression}

sed -i \
  -e "s|<title>openGym</title>|<title>$NAME</title>|" \
  -e "s|<meta name=\"apple-mobile-web-app-title\" content=\"openGym\">|<meta name=\"apple-mobile-web-app-title\" content=\"$NAME\">|" \
  -e "s|<meta name=\"description\" content=\"[^\"]*\">|<meta name=\"description\" content=\"$DESC\">|" \
  "$DIST/index.html"
sed -i \
  -e "s|\"name\": \"openGym\"|\"name\": \"$NAME\"|" \
  -e "s|\"short_name\": \"openGym\"|\"short_name\": \"$NAME\"|" \
  -e "s|\"description\": \"[^\"]*\"|\"description\": \"$DESC\"|" \
  "$DIST/manifest.json"
sed -i -e "s#data.title || 'openGym'#data.title || '$NAME'#" "$DIST/sw.js"
cp "$HERE/icons/icon-180.png" "$DIST/icon-180.png"
cp "$HERE/icons/icon-512.png" "$DIST/icon-512.png"

# Fail the build if anything upstream renamed slipped past the substitutions above.
if grep -q '>openGym<\|content="openGym"' "$DIST/index.html" || grep -q '"openGym"' "$DIST/manifest.json"; then
  echo "apply-dist: upstream brand still present in index.html/manifest.json - update brand/huru/apply-dist.sh" >&2
  exit 1
fi
echo "apply-dist: branded $DIST as $NAME"
