#!/bin/sh
# Pojedyncze uruchomienie monitora (wywoływane z crona i przy starcie kontenera).
set -eu
[ -f /etc/monitor.env ] && . /etc/monitor.env
cd /app
echo "--- $(date '+%Y-%m-%d %H:%M:%S %Z') sprawdzam dostępność VPS ---"
exec node src/index.mjs
