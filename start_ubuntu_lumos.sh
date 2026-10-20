#!/bin/sh
set -eu
star_arm_script_dir=${0%/*}
case "$0" in */*) ;; *) star_arm_script_dir=. ;; esac
cd -- "${star_arm_script_dir:-/}"
if [ ! -x /usr/bin/python3 ]; then
  printf '%s\n' '需要 Ubuntu 22.04 / 24.04 自带的 Python 3。请先在系统软件管理器安装。' >&2
  exit 1
fi
# Always prepare the isolated Lumos environment with Ubuntu's system Python.
exec /usr/bin/python3 tools/start_lumos_local.py "$@"
