# ClaudeClaw v2

This is the root of a multi-agent personal assistant. The `claude` CLI is invoked as a subprocess by the Telegram bot, War Room, and Mission Control loops. When you're reading this, you're probably being spawned from one of those.

## What lives where

- `src/` — Node/TypeScript core (bot, agent SDK wrapper, memory, security, scheduler, dashboard, war room bridge)
- `warroom/` — Python Pipecat voice server (Gemini Live default, Deepgram+Cartesia legacy)
- `agents/<id>/CLAUDE.md` — per-agent system prompt; loaded when that agent is the active subprocess cwd
- `skills/` — project-level skills (webex-admin, perdigon-ops, baseball-charting)
- `store/` — SQLite DB, PID lock, session caches (gitignored)
- `workspace/uploads/` — downloaded Telegram media (gitignored)
- `agent.yaml` — agent registry (id, cwd, CLAUDE.md path, telegram token env var)

## Agents

| id | name | purpose | cwd |
|----|------|---------|-----|
| `main` | Main | Default assistant | project root |
| `comms` | Comms | Email, Webex messaging, Slack drafts | project root |
| `content` | Content | Writing and editing | project root |
| `ops` | Ops | Infrastructure, deploys, sysadmin | project root |
| `research` | Research | Deep dives, competitive analysis | project root |
| `coach` | Coach | Lincoln Zebras baseball ops | project root |
| `webster` | Webster | Perdigon Webex admin | `C:/Users/mikea/projects/perdigon/webex/deployment-cli` |

Delegation syntax from any agent: `@<agent_id>: <prompt>`.

## Conventions

- Absolute dates in anything you save. Never "Thursday" — always `2026-04-18`.
- Confirm before destructive ops.
- Memory v2 extracts durable facts via Gemini. Don't re-ask for context you already have.
- Don't add helper scripts, abstractions, or comments unless they earn their keep.
