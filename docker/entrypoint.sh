#!/bin/sh
# Generuje crontab z CRON_SCHEDULE i uruchamia crond na pierwszym planie (PID 1 przez tini/init).
set -eu

: "${CRON_SCHEDULE:?Ustaw CRON_SCHEDULE (5 pól crona, np. '*/10 * * * *')}"

# Walidacja: dokładnie 5 pól. set -f wyłącza rozwijanie '*' przez powłokę.
set -f
# shellcheck disable=SC2086
set -- $CRON_SCHEDULE
set +f
if [ "$#" -ne 5 ]; then
  echo "Błąd: CRON_SCHEDULE musi mieć 5 pól (minuta godzina dzień miesiąc dzień_tygodnia), a ma $#: '$CRON_SCHEDULE'" >&2
  exit 1
fi

if [ ! -r "${GITHUB_TOKEN_FILE:-}" ]; then
  echo "Błąd: brak odczytywalnego sekretu GITHUB_TOKEN_FILE='${GITHUB_TOKEN_FILE:-}'. Sprawdź sekcję 'secrets' w docker-compose.yml." >&2
  exit 1
fi

# crond nie dziedziczy środowiska, więc zapisujemy je do pliku, który source'uje run-monitor.sh.
q() { printf "'%s'" "$(printf %s "$1" | sed "s/'/'\\\\''/g")"; }
{
  for v in TZ GITHUB_TOKEN_FILE GITHUB_REPOSITORY COUNTRIES OVH_SUBSIDIARY; do
    eval "val=\${$v:-}"
    [ -n "$val" ] && printf 'export %s=%s\n' "$v" "$(q "$val")"
  done
} > /etc/monitor.env

# Wyjście zadania trafia na stdout kontenera (docker compose logs).
printf '%s /usr/local/bin/run-monitor.sh >/proc/1/fd/1 2>&1\n' "$CRON_SCHEDULE" > /etc/crontabs/root

echo "Harmonogram: '$CRON_SCHEDULE' (strefa: ${TZ:-UTC})"

if [ "${RUN_ON_START:-true}" = "true" ]; then
  echo "Uruchamiam pierwsze sprawdzenie od razu (RUN_ON_START=true)…"
  /usr/local/bin/run-monitor.sh || echo "Pierwsze sprawdzenie zakończyło się błędem (cron i tak działa dalej)." >&2
fi

exec crond -f -l 6 -L /dev/stdout
