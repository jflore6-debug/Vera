#!/bin/bash
# Builds Flor.app: a lightweight macOS launcher (Go binary, embeds the built
# web app) wrapped in a real .app bundle with the Flor icon. Produces
# release/Flor.app and release/Flor-mac.zip.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Building web app"
npm run build

echo "==> Syncing embedded webapp assets"
rm -rf native/webapp
cp -r dist native/webapp

echo "==> Building native launcher (arm64 + amd64)"
mkdir -p native/build
(cd native && go vet ./...)
(cd native && GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o build/flor-arm64 .)
(cd native && GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o build/flor-amd64 .)

echo "==> Assembling Flor.app"
APP="release/Flor.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp build/icon.icns "$APP/Contents/Resources/icon.icns"
cp native/build/flor-arm64 "$APP/Contents/Resources/flor-arm64"
cp native/build/flor-amd64 "$APP/Contents/Resources/flor-amd64"
chmod +x "$APP/Contents/Resources/flor-arm64" "$APP/Contents/Resources/flor-amd64"
cp scripts/Info.plist "$APP/Contents/Info.plist"
cp scripts/launcher.sh "$APP/Contents/MacOS/Flor"
chmod +x "$APP/Contents/MacOS/Flor"

echo "==> Zipping"
rm -f release/Flor-mac.zip
(cd release && zip -r -X -y Flor-mac.zip Flor.app > /dev/null)

echo "==> Done: release/Flor.app and release/Flor-mac.zip"
du -sh release/Flor.app release/Flor-mac.zip
