#!/bin/sh
set -eu
star_arm_test_dir=${0%/*}
case "$0" in */*) ;; *) star_arm_test_dir=. ;; esac
cd -- "${star_arm_test_dir:-/}"
exec sh ./start_ubuntu.sh --require-local-version --act-workbench "$@"
