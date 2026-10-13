#!/bin/sh
# Huru GYM Android build: upstream's Capacitor shell (frontend/android), rebranded at build time
# the way apply-dist.sh rebrands the web build, so upstream's files stay untouched in git.
#
# Run on a clean checkout (it edits frontend/capacitor.config.json and the android/ shell in
# place), after `npm ci` in frontend/, with a JDK 21 and the Android SDK (ANDROID_HOME):
#   sh brand/huru/android/build.sh
# CI: .github/workflows/huru-android.yml. Output in dist-android/: a release APK to install on a
# phone and an AAB for Google Play, signed when HURU_KEYSTORE is set, unsigned otherwise.
#
# Env: HURU_VERSION_CODE (integer, must grow with every Play upload; CI uses the run number),
#      HURU_VERSION_NAME (default <frontend version>-huru.<code>), HURU_APP_ID, HURU_APP_NAME,
#      HURU_KEYSTORE (path to the upload keystore), HURU_KEYSTORE_PASSWORD, HURU_KEY_ALIAS.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
FE="$ROOT/frontend"
OUT="$ROOT/dist-android"
APP_ID="${HURU_APP_ID:-com.adxfuel.hurugym}"
APP_NAME="${HURU_APP_NAME:-Huru GYM}"
CODE="${HURU_VERSION_CODE:-1}"
VERSION="$(node -p "require('$FE/package.json').version")"
NAME="${HURU_VERSION_NAME:-$VERSION-huru.$CODE}"
ALIAS="${HURU_KEY_ALIAS:-huru-upload}"
UPSTREAM_ID=ch.duartesantos.opengym

cd "$FE"
echo "== $APP_NAME $NAME ($CODE), $APP_ID"

# 1. Capacitor config: cap sync copies it into the shell, so it changes before the sync.
node -e "
const fs = require('fs'), c = JSON.parse(fs.readFileSync('capacitor.config.json', 'utf8'));
c.appId = process.argv[1]; c.appName = process.argv[2];
fs.writeFileSync('capacitor.config.json', JSON.stringify(c, null, 2) + '\n');" "$APP_ID" "$APP_NAME"

# 2. The web bundle: mobile flavour, Huru brand, no Gym visual media (licensed to openGym only).
VITE_MOBILE=1 VITE_APP_NAME="$APP_NAME" VITE_SITE_HOST="${HURU_SITE_HOST:-gym.adxfuel.com}" \
  VITE_SOURCE_URL="${HURU_SOURCE_URL:-https://github.com/epipra/huru-gym}" VITE_EXERCISE_MEDIA=0 \
  npx vite build
APP_NAME="$APP_NAME" sh "$ROOT/brand/huru/apply-dist.sh" dist
npx cap sync android
node scripts/check-mobile-bundle.mjs

# 3. The shell's identity. The Java namespace stays upstream's (invisible to users, and moving
#    the sources would conflict with every upstream merge); the application id is what Android
#    and Google Play know the app by.
G=android/app/build.gradle
sed -i \
  -e "s|applicationId \"$UPSTREAM_ID\"|applicationId \"$APP_ID\"|" \
  -e "s|versionCode [0-9][0-9]*|versionCode $CODE|" \
  -e "s|versionName \"[^\"]*\"|versionName \"$NAME\"|" \
  "$G"
grep -q "applicationId \"$APP_ID\"" "$G" || { echo "build.gradle: applicationId not replaced" >&2; exit 1; }
S=android/app/src/main/res/values/strings.xml
sed -i \
  -e "s|<string name=\"app_name\">[^<]*</string>|<string name=\"app_name\">$APP_NAME</string>|" \
  -e "s|<string name=\"title_activity_main\">[^<]*</string>|<string name=\"title_activity_main\">$APP_NAME</string>|" \
  -e "s|<string name=\"package_name\">[^<]*</string>|<string name=\"package_name\">$APP_ID</string>|" \
  -e "s|<string name=\"custom_url_scheme\">[^<]*</string>|<string name=\"custom_url_scheme\">$APP_ID</string>|" \
  "$S"
grep -q "<string name=\"app_name\">$APP_NAME</string>" "$S" || { echo "strings.xml: app_name not replaced" >&2; exit 1; }

# 4. Launcher icon (adaptive and legacy) and splash, from brand/huru/android/assets.
npx capacitor-assets generate --android --assetPath "$HERE/assets" \
  --iconBackgroundColor '#15803D' --iconBackgroundColorDark '#15803D' \
  --splashBackgroundColor '#0c0e12' --splashBackgroundColorDark '#0c0e12'

# 5. Build.
cd android
./gradlew --no-daemon assembleRelease bundleRelease
APK=app/build/outputs/apk/release/app-release-unsigned.apk
AAB=app/build/outputs/bundle/release/app-release.aab
rm -rf "$OUT" && mkdir -p "$OUT"

# 6. Sign with the upload key (Google Play re-signs for users with its own app signing key).
if [ -n "${HURU_KEYSTORE:-}" ]; then
  : "${HURU_KEYSTORE_PASSWORD:?HURU_KEYSTORE_PASSWORD is needed with HURU_KEYSTORE}"
  BT="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
  "$BT/zipalign" -f -p 4 "$APK" "$OUT/aligned.apk"
  "$BT/apksigner" sign --ks "$HURU_KEYSTORE" --ks-key-alias "$ALIAS" \
    --ks-pass env:HURU_KEYSTORE_PASSWORD --key-pass env:HURU_KEYSTORE_PASSWORD \
    --out "$OUT/huru-gym-$NAME.apk" "$OUT/aligned.apk"
  rm -f "$OUT/aligned.apk"
  # verify's exit status is the check; the certificate lines are only printed (their wording
  # varies between build-tools versions, so a filter must never decide the outcome).
  "$BT/apksigner" verify --print-certs "$OUT/huru-gym-$NAME.apk" > "$OUT/apk-certs.txt"
  grep -E "certificate (DN|SHA-256)" "$OUT/apk-certs.txt" | sort -u || true
  rm -f "$OUT/apk-certs.txt"
  jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$HURU_KEYSTORE" \
    -storepass:env HURU_KEYSTORE_PASSWORD -keypass:env HURU_KEYSTORE_PASSWORD \
    -signedjar "$OUT/huru-gym-$NAME.aab" "$AAB" "$ALIAS" >/dev/null
  jarsigner -verify "$OUT/huru-gym-$NAME.aab" >/dev/null && echo "aab signed"
else
  echo "HURU_KEYSTORE not set: unsigned outputs (cannot be installed or uploaded)"
  cp "$APK" "$OUT/huru-gym-$NAME-unsigned.apk"
  cp "$AAB" "$OUT/huru-gym-$NAME-unsigned.aab"
fi
ls -l "$OUT"
