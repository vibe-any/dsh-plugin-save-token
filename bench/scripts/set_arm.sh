#!/bin/bash
# 切换 A/B 臂并重置计量器。用法: ./set_arm.sh baseline|treatment
set -e
API=http://127.0.0.1:3080/save-token/api
ARM="$1"
case "$ARM" in
  baseline)  V=false ;;
  treatment) V=true ;;
  *) echo "usage: $0 baseline|treatment"; exit 1 ;;
esac
for key in compress dedupe compactAssist; do
  curl -sS -X POST "$API/set-enabled" -d "{\"key\":\"$key\",\"value\":$V}" >/dev/null
done
curl -sS -X POST "$API/reset" >/dev/null
sleep 1
FLAGS=$(curl -sS "$API/dashboard")
echo "$FLAGS" | jq '{flags, spillReady}'
# expandTool 为插件挂载期恒注册（flags 恒 true，两臂对称），不参与开关
OK=$(echo "$FLAGS" | jq -r "[.flags.compress==$V,.flags.dedupe==$V] | all")
if [ "$OK" = "true" ]; then echo "ARM=$ARM ACTIVE"; else echo "ARM MISMATCH!"; exit 2; fi
