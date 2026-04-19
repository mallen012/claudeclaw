#!/usr/bin/env bash
# Create a new agent skeleton (dir + CLAUDE.md + agent.yaml stanza).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

AGENT_ID="${1:-}"
AGENT_NAME="${2:-}"

if [[ -z "$AGENT_ID" || -z "$AGENT_NAME" ]]; then
  echo "Usage: $0 <agent_id> \"<Agent Name>\"" >&2
  exit 1
fi

if ! [[ "$AGENT_ID" =~ ^[a-z][a-z0-9_-]{0,29}$ ]]; then
  echo "agent_id must match [a-z][a-z0-9_-]{0,29}" >&2
  exit 1
fi

DIR="$ROOT/agents/$AGENT_ID"
if [[ -e "$DIR" ]]; then
  echo "Agent $AGENT_ID already exists at $DIR" >&2
  exit 1
fi

mkdir -p "$DIR"
cp "$ROOT/agents/_template/CLAUDE.md" "$DIR/CLAUDE.md"
sed -i.bak "s/\[AGENT NAME\]/$AGENT_NAME/g" "$DIR/CLAUDE.md"
rm -f "$DIR/CLAUDE.md.bak"

TOKEN_ENV="$(echo "$AGENT_ID" | tr '[:lower:]' '[:upper:]')_BOT_TOKEN"

cat <<YAML >> "$ROOT/agent.yaml"

  - id: $AGENT_ID
    name: $AGENT_NAME
    emoji: "🤖"
    description: TODO
    cwd: ""
    claude_md: agents/$AGENT_ID/CLAUDE.md
    telegram_token_env: $TOKEN_ENV
YAML

echo "Created agent $AGENT_ID."
echo "  - Edit: $DIR/CLAUDE.md"
echo "  - Add $TOKEN_ENV to .env if you want a dedicated Telegram bot."
