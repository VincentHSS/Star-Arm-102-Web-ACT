#!/bin/sh
set -eu
star_arm_script_dir=${0%/*}
case "$0" in */*) ;; *) star_arm_script_dir=. ;; esac
cd -- "${star_arm_script_dir:-/}"
if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' '需要 Python 3.10～3.12，请在 Ubuntu 软件管理器安装。' >&2
  exit 1
fi
exec python3 tools/serve_local.py "$@"
