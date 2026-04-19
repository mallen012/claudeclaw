#!/usr/bin/env bash
# Send a Telegram message from shell scripts (e.g., cron, deploy hooks).
# Usage: ./notify.sh "your message"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  set -a
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${ALLOWED_CHAT_ID:-}" ]]; then
  echo "TELEGRAM_BOT_TOKEN or ALLOWED_CHAT_ID missing" >&2
  exit 1
fi

MSG="${1:-no message}"
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${ALLOWED_CHAT_ID}" \
  --data-urlencode "text=${MSG}" > /dev/null
