#!/usr/bin/env bash
# Builds the Mac App Store upload package: a universal .app signed for App
# Store distribution, wrapped in a signed installer .pkg, then checked the way
# App Store Connect will check it. Used by .github/workflows/app-store.yml and
# by hand.
#
#   scripts/build-appstore.sh <build-number> [out-dir]
#
# <build-number> becomes CFBundleVersion and must exceed every build already
# uploaded for this app. Needs, in the login (or CI) keychain:
#   3rd Party Mac Developer Application: … — signs the .app (tauri.appstore.conf.json)
#   3rd Party Mac Developer Installer: …   — signs the .pkg ($APPSTORE_INSTALLER_IDENTITY)
# and src-tauri/embedded.provisionprofile (gitignored).
set -euo pipefail

BUILD_NUMBER="${1:?usage: $0 <build-number> [out-dir]}"
OUT_DIR="${2:-dist-appstore}"
INSTALLER_IDENTITY="${APPSTORE_INSTALLER_IDENTITY:-3rd Party Mac Developer Installer: Chang KaiChieh (H2ZM466J6A)}"
PROFILE="src-tauri/embedded.provisionprofile"

cd "$(dirname "$0")/.."

die() { echo "error: $*" >&2; exit 1; }

[[ "$BUILD_NUMBER" =~ ^[0-9]+$ ]] || die "build number must be an integer, got '$BUILD_NUMBER'"
[ -f "$PROFILE" ] || die "$PROFILE is missing (it is gitignored; copy it from the main checkout or the CI secret)"

# A lapsed profile only fails at upload, after a full universal build.
expires=$(security cms -D -i "$PROFILE" | plutil -extract ExpirationDate raw -o - -)
[ "$(date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$expires" +%s)" -gt "$(date -u +%s)" ] ||
  die "provisioning profile expired on $expires"

VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
PRODUCT=$(node -p "require('./src-tauri/tauri.conf.json').productName")
echo "==> Building $PRODUCT $VERSION (build $BUILD_NUMBER)"

pnpm tauri build \
  --target universal-apple-darwin \
  --config src-tauri/tauri.appstore.conf.json \
  --config "{\"bundle\":{\"macOS\":{\"bundleVersion\":\"$BUILD_NUMBER\"}}}"

APP="target/universal-apple-darwin/release/bundle/macos/$PRODUCT.app"
PLIST="$APP/Contents/Info.plist"
[ -d "$APP" ] || die "bundle not found at $APP"

echo "==> Checking the bundle"
[ "$(plutil -extract CFBundleShortVersionString raw -o - "$PLIST")" = "$VERSION" ] || die "CFBundleShortVersionString is not $VERSION"
[ "$(plutil -extract CFBundleVersion raw -o - "$PLIST")" = "$BUILD_NUMBER" ] || die "CFBundleVersion is not $BUILD_NUMBER"
[ -f "$APP/Contents/embedded.provisionprofile" ] || die "embedded.provisionprofile was not bundled"
EXE="$APP/Contents/MacOS/$(plutil -extract CFBundleExecutable raw -o - "$PLIST")"
archs=$(lipo -archs "$EXE")
[[ "$archs" == *x86_64* && "$archs" == *arm64* ]] || die "expected a universal binary, got: $archs"
codesign --verify --deep --strict "$APP"

mkdir -p "$OUT_DIR"
PKG="$OUT_DIR/${PRODUCT// /-}-$VERSION-build$BUILD_NUMBER-universal.pkg"
echo "==> Packaging $PKG"
productbuild --component "$APP" /Applications --sign "$INSTALLER_IDENTITY" "$PKG"
pkgutil --check-signature "$PKG"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  { echo "pkg=$PKG"; echo "version=$VERSION"; } >> "$GITHUB_OUTPUT"
fi
echo "==> Done: $PKG"
