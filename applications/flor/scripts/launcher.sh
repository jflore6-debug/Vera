#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then
  exec "$DIR/../Resources/flor-arm64"
else
  exec "$DIR/../Resources/flor-amd64"
fi
