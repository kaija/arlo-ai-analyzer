#!/usr/bin/env bash
# Builds the direct-download .dmg: a universal .app signed with Developer ID,
# without the App Sandbox (src-tauri/Entitlements.plist), so it can run the
# user's Claude Code CLI for live insights and /context. Tauri notarizes and
# staples the .app; the .dmg around it is then signed, notarized and stapled
# here. Used by .github/workflows/direct-download.yml and by hand.
#
#   scripts/build-dmg.sh [out-dir]
#
# Needs, in the login (or CI) keychain:
#   Developer ID Application: … — signs the .app and .dmg ($DEVELOPER_ID_IDENTITY)
# and an App Store Connect API key for notarytool:
#   APPLE_API_KEY (key id), APPLE_API_ISSUER, APPLE_API_KEY_PATH (the .p8)
# Set SKIP_NOTARIZE=1 for a signed but un-notarized local build.
set -euo pipefail

OUT_DIR="${1:-dist-dmg}"
IDENTITY="${DEVELOPER_ID_IDENTITY:-Developer ID Application: Chang KaiChieh (H2ZM466J6A)}"

cd "$(dirname "$0")/.."

die() { echo "error: $*" >&2; exit 1; }

if [ -z "${SKIP_NOTARIZE:-}" ]; then
  for name in APPLE_API_KEY APPLE_API_ISSUER APPLE_API_KEY_PATH; do
    [ -n "${!name:-}" ] || die "$name is not set (or set SKIP_NOTARIZE=1)"
  done
  [ -f "$APPLE_API_KEY_PATH" ] || die "APPLE_API_KEY_PATH does not exist: $APPLE_API_KEY_PATH"
else
  # Tauri notarizes whenever these are set; keep a local test build quick.
  unset APPLE_API_KEY APPLE_API_ISSUER APPLE_API_KEY_PATH
fi
security find-identity -v -p codesigning | grep -qF "$IDENTITY" || die "signing identity not found: $IDENTITY"

VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
PRODUCT=$(node -p "require('./src-tauri/tauri.conf.json').productName")
echo "==> Building $PRODUCT $VERSION (direct download)"

APPLE_SIGNING_IDENTITY="$IDENTITY" pnpm tauri build \
  --target universal-apple-darwin \
  --bundles app,dmg

BUNDLE="target/universal-apple-darwin/release/bundle"
APP="$BUNDLE/macos/$PRODUCT.app"
[ -d "$APP" ] || die "bundle not found at $APP"
shopt -s nullglob
dmgs=("$BUNDLE/dmg/"*.dmg)
[ "${#dmgs[@]}" -eq 1 ] || die "expected one .dmg in $BUNDLE/dmg, found ${#dmgs[@]}"
BUILT_DMG="${dmgs[0]}"

echo "==> Checking the bundle"
PLIST="$APP/Contents/Info.plist"
[ "$(plutil -extract CFBundleShortVersionString raw -o - "$PLIST")" = "$VERSION" ] || die "CFBundleShortVersionString is not $VERSION"
EXE="$APP/Contents/MacOS/$(plutil -extract CFBundleExecutable raw -o - "$PLIST")"
archs=$(lipo -archs "$EXE")
[[ "$archs" == *x86_64* && "$archs" == *arm64* ]] || die "expected a universal binary, got: $archs"
codesign --verify --deep --strict "$APP"
# The whole point of this build: no sandbox, so the CLI features work.
if codesign -d --entitlements - --xml "$APP" 2>/dev/null | grep -q "com.apple.security.app-sandbox"; then
  die "the direct-download app must not be sandboxed"
fi

mkdir -p "$OUT_DIR"
DMG="$OUT_DIR/${PRODUCT// /-}-$VERSION-universal.dmg"
cp "$BUILT_DMG" "$DMG"
codesign --force --sign "$IDENTITY" --timestamp "$DMG"

if [ -z "${SKIP_NOTARIZE:-}" ]; then
  echo "==> Notarizing $DMG"
  xcrun notarytool submit "$DMG" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" \
    --issuer "$APPLE_API_ISSUER" --wait
  xcrun stapler staple "$DMG"
  xcrun stapler validate "$DMG"
  spctl --assess --type open --context context:primary-signature --verbose "$DMG"
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  { echo "dmg=$DMG"; echo "version=$VERSION"; } >> "$GITHUB_OUTPUT"
fi
echo "==> Done: $DMG"
