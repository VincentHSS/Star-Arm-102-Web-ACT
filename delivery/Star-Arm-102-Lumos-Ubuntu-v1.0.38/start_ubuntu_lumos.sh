#!/usr/bin/env bash
set -euo pipefail
LUMOS_PACKAGE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$LUMOS_PACKAGE_DIR"
exec /usr/bin/python3 "$LUMOS_PACKAGE_DIR/tools/start_lumos_local.py" "$@"
