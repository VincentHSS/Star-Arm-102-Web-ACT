#!/bin/sh
set -eu
star_arm_script_dir=${0%/*}
case "$0" in */*) ;; *) star_arm_script_dir=. ;; esac
cd -- "${star_arm_script_dir:-/}"
if [ ! -x /usr/bin/python3 ]; then
  printf '%s\n' '需要 Python 3.10～3.12，请在 Ubuntu 软件管理器安装。' >&2
  exit 1
fi
# Use Ubuntu's Python even when a Conda environment is active.
if ! /usr/bin/python3 tools/ubuntu_setup.py; then
  printf '%s\n' '启动已暂停，修复提示的问题后重新启动即可。' >&2
  exit 1
fi
exec /usr/bin/python3 tools/serve_local.py "$@"
