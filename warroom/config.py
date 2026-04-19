"""War Room configuration — resolves project root, env, voice mappings."""
from __future__ import annotations
import json
import os
from pathlib import Path
from typing import Any

# ── Project root ───────────────────────────────────────────────────
WARROOM_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = WARROOM_DIR.parent


# ── Env loader (reads project .env, no mutation of os.environ for secrets) ─
def _load_env_file() -> dict[str, str]:
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        return {}
    out: dict[str, str] = {}
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.strip().strip('"').strip("'")
        out[k.strip()] = v
    return out


_ENV = _load_env_file()


def env(key: str, default: str = "") -> str:
    return _ENV.get(key) or os.environ.get(key, default)


# ── Runtime settings ───────────────────────────────────────────────
WARROOM_PORT = int(env("WARROOM_PORT", "7860"))
WARROOM_MODE = env("WARROOM_MODE", "live")  # "live" | "legacy"

GOOGLE_API_KEY = env("GOOGLE_API_KEY")
DEEPGRAM_API_KEY = env("DEEPGRAM_API_KEY")
CARTESIA_API_KEY = env("CARTESIA_API_KEY")

NODE_BIN = env("NODE_BIN", "node")
VOICE_BRIDGE = str(PROJECT_ROOT / "dist" / "agent-voice-bridge.js")

PIN_FILE = Path("/tmp/warroom-pin.json")


# ── Voice mappings ─────────────────────────────────────────────────
def _default_voices() -> dict[str, dict[str, Any]]:
    return {
        "main": {
            "name": "Main",
            "role": "Hand of the King",
            "gemini_live_voice": "Charon",
            "cartesia_voice_id": "79a125e8-cd45-4c13-8a67-188112f4dd22",
        },
        "research": {
            "name": "Research",
            "role": "Grand Maester",
            "gemini_live_voice": "Kore",
            "cartesia_voice_id": "2ee87190-8f84-4925-97da-e52547f9462c",
        },
        "comms": {
            "name": "Comms",
            "role": "Master of Whisperers",
            "gemini_live_voice": "Aoede",
            "cartesia_voice_id": "a0e99841-438c-4a64-b679-ae501e7d6091",
        },
        "content": {
            "name": "Content",
            "role": "Royal Bard",
            "gemini_live_voice": "Leda",
            "cartesia_voice_id": "87748186-23bb-4158-a1eb-332911b0b708",
        },
        "ops": {
            "name": "Ops",
            "role": "Master of War",
            "gemini_live_voice": "Alnilam",
            "cartesia_voice_id": "7360f116-6306-4e9a-b487-1235f35a0f21",
        },
        "coach": {
            "name": "Coach",
            "role": "Tourney Champion",
            "gemini_live_voice": "Puck",
            "cartesia_voice_id": "03496517-369a-4db1-8236-3d3ae459ddf7",
        },
        "webster": {
            "name": "Webster",
            "role": "Master of Ravens",
            "gemini_live_voice": "Fenrir",
            "cartesia_voice_id": "63ff761f-c1e8-414b-b969-d1833d1c870c",
        },
    }


def load_voices() -> dict[str, dict[str, Any]]:
    path = WARROOM_DIR / "voices.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return _default_voices()
