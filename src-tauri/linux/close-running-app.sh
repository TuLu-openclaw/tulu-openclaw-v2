#!/bin/sh
set -e

# Close running XingShu/OpenClaw processes before Debian package install/upgrade.
# Keep this script best-effort: package installation should only fail if dpkg itself fails.

NAMES="XingShu 星枢OpenClaw XingShuOpenClaw TuLuOpenClaw clawpanel"

for name in $NAMES; do
  if command -v pkill >/dev/null 2>&1; then
    pkill -TERM -x "$name" 2>/dev/null || true
  fi
done

sleep 1

for name in $NAMES; do
  if command -v pkill >/dev/null 2>&1; then
    pkill -KILL -x "$name" 2>/dev/null || true
  fi
done

# Also close processes launched from common install locations.
if command -v pgrep >/dev/null 2>&1; then
  for pid in $(pgrep -f '/usr/lib/.*/XingShu\|/opt/.*/XingShu' 2>/dev/null || true); do
    kill -TERM "$pid" 2>/dev/null || true
  done
  sleep 1
  for pid in $(pgrep -f '/usr/lib/.*/XingShu\|/opt/.*/XingShu' 2>/dev/null || true); do
    kill -KILL "$pid" 2>/dev/null || true
  done
fi

exit 0
