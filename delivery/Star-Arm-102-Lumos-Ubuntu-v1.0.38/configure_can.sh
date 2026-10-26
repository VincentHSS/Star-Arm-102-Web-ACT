#!/usr/bin/env bash
set -euo pipefail
LUMOS_CAN_INTERFACE="${1:-can0}"
if [[ ! "$LUMOS_CAN_INTERFACE" =~ ^[a-zA-Z][a-zA-Z0-9_.-]{0,14}$ ]]; then
  printf '%s\n' 'CAN 接口名称无效。' >&2
  exit 1
fi
if [[ "$EUID" -ne 0 ]]; then
  printf '%s\n' '请先停止遥操作并断开设备，然后使用 sudo bash configure_can.sh can0 配置所选接口。' >&2
  exit 1
fi
LUMOS_IP=""
for LUMOS_IP_CANDIDATE in /usr/sbin/ip /usr/bin/ip /sbin/ip /bin/ip; do
  if [[ -x "$LUMOS_IP_CANDIDATE" ]]; then LUMOS_IP="$LUMOS_IP_CANDIDATE"; break; fi
done
if [[ -z "$LUMOS_IP" ]]; then printf '%s\n' '未找到 iproute2，请先完成启动器的系统依赖准备。' >&2; exit 1; fi
"$LUMOS_IP" -details -json link show "$LUMOS_CAN_INTERFACE" | /usr/bin/python3 -c 'import json,sys; entries=json.load(sys.stdin); sys.exit(0 if len(entries)==1 and entries[0].get("linkinfo",{}).get("info_kind")=="can" else "所选接口不是 CAN，未修改。")'
"$LUMOS_IP" link set "$LUMOS_CAN_INTERFACE" down
"$LUMOS_IP" link set "$LUMOS_CAN_INTERFACE" type can bitrate 1000000
"$LUMOS_IP" link set "$LUMOS_CAN_INTERFACE" up
"$LUMOS_IP" -details link show "$LUMOS_CAN_INTERFACE"
