# ClaudeClaw v2

Personal AI assistant with 7 specialized agents, memory, voice room, scheduled tasks, meeting briefings, and a web dashboard.

## What you get

- **7 agents** — Main, Comms, Content, Ops, Research, Coach, Webster — each with its own Telegram bot, working directory, and system prompt. Shared hive mind for cross-agent awareness.
- **Memory v2** — LLM-extracted facts via Gemini, 768-dim embeddings, 5-layer retrieval, 30-min consolidation, decay with pinning, supersession, relevance feedback.
- **War Room** — real-time voice chat with your agents from the browser (port 7860). Gemini Live default, Deepgram+Cartesia legacy mode.
- **Mission Control** — cron-based scheduled tasks with priority queue.
- **Meeting bot** — Recall.ai joins your Meet/Zoom/Webex/Teams calls with 75s pre-flight briefing.
- **WhatsApp bridge** — read and reply to WhatsApp from Telegram.
- **Security stack** — PIN lock, idle auto-lock, kill phrase, exfiltration guard (15+ regex patterns including base64 and URL-encoded), audit log.
- **Dashboard** — web UI on port 3141, single embedded HTML, memory/hive/missions/audit.
- **Voice** — Groq Whisper STT for voice notes.

## Prereqs

- Node.js 20+
- Python 3.9+ (War Room only)
- `claude` CLI installed and logged in
- Telegram bot token from @BotFather

## Install

```bash
npm install
npm run setup     # interactive wizard
npm run build
npm start         # or rely on the installed launchd/systemd service
```

## Commands

| Command | What |
|---|---|
| `npm run setup` | Interactive setup wizard |
| `npm run dev` | Run in dev mode (tsx) |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled build |
| `npm run status` | Health check |
| `npm run schedule <cmd>` | Manage scheduled missions |
| `npm run mission <cmd>` | Mission Control CLI |
| `npm run agent:create <id> <name>` | Create a new agent |
| `npm run agent:voice` | Voice bridge subprocess (called by War Room) |
| `npm run meet <cmd>` | Meeting bot CLI |
| `npm run warroom` | Start War Room Python server |

## Telegram commands (inside the bot)

- `/start` — show your chat ID
- `/newchat` — reset session
- `/voice` — toggle voice reply preference
- `/lock` — manually lock
- `/stop` — cancel in-flight request
- `/wa` — WhatsApp bridge menu
- `@<agent_id>: <prompt>` — delegate to a specific agent

## Skills

Project skills live in `skills/`:
- `webex-admin` — Webex Calling API recipes (Webster's primary tool)
- `perdigon-ops` — business context, customer list, infrastructure
- `baseball-charting` — Coach's scoring and chart methodology

Global skills from `~/.claude/skills/` are also loaded automatically.

## Config

Everything goes in `.env`. See `.env.example` for all keys.

Per-agent config lives in `agent.yaml` at the project root. Runtime overrides can live at `$CLAUDECLAW_CONFIG/agent.yaml` (defaults to `~/.claudeclaw/agent.yaml`).

## Directory layout

```
src/              TypeScript core
warroom/          Python War Room server (Pipecat)
agents/<id>/      Per-agent CLAUDE.md system prompts
skills/           Project-level skills
scripts/          Setup + service install + shell helpers
store/            SQLite DB + PID lock (gitignored)
workspace/        Downloaded Telegram media (gitignored)
```

## Architecture

```
Telegram / Discord / War Room
        ↓
Message Queue (FIFO per chat)
        ↓
Security Gate (PIN + chat ID allowlist)
        ↓
Memory Inject (5-layer retrieval)
        ↓
Agent SDK (Claude Code subprocess, resume session)
        ↓
Exfiltration Guard (redact secrets)
        ↓
Cost Footer → Reply

7 Agents ↔ Hive Mind (shared SQLite log)
7 Agents ↔ Scheduler + Mission Control (cron + priority queue)
```

## Windows note

Background service auto-install is Mac/Linux only. On Windows:

```powershell
npm install -g pm2
pm2 start dist/index.js --name claudeclaw
pm2 save
pm2 startup
```

## License

Personal tool; no license granted.
