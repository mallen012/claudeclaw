"""Bridge to the Node agent-voice-bridge subprocess.

Invokes `node dist/agent-voice-bridge.js --agent <id> [--quick] [--chat-id X]`
with the prompt on stdin, parses the single-line JSON response on stdout.
"""
from __future__ import annotations
import asyncio
import json
import os
from dataclasses import dataclass
from typing import Optional

from .config import NODE_BIN, VOICE_BRIDGE


@dataclass
class AgentReply:
    ok: bool
    text: str
    model: Optional[str] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    error: Optional[str] = None


async def delegate_to_agent(
    agent_id: str,
    prompt: str,
    *,
    chat_id: Optional[str] = None,
    quick: bool = True,
    timeout: float = 120.0,
) -> AgentReply:
    args = [NODE_BIN, VOICE_BRIDGE, "--agent", agent_id]
    if chat_id:
        args += ["--chat-id", chat_id]
    if quick:
        args += ["--quick"]

    env = os.environ.copy()
    # Scrub secrets from subprocess env — the Node side reads its own .env.
    for k in list(env.keys()):
        if k in {"ANTHROPIC_API_KEY", "GROQ_API_KEY", "TELEGRAM_BOT_TOKEN"}:
            env.pop(k, None)

    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(prompt.encode("utf-8")),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        return AgentReply(ok=False, text="", error="timeout")
    except FileNotFoundError:
        return AgentReply(
            ok=False,
            text="",
            error=f"bridge not found: {VOICE_BRIDGE} (run `npm run build`)",
        )

    line = stdout.decode("utf-8", errors="replace").strip().splitlines()
    if not line:
        return AgentReply(ok=False, text="", error=f"no output. stderr: {stderr.decode(errors='replace')[:500]}")
    try:
        data = json.loads(line[-1])
    except json.JSONDecodeError:
        return AgentReply(ok=False, text="", error=f"bad json: {line[-1][:300]}")

    if not data.get("ok"):
        return AgentReply(ok=False, text="", error=data.get("error", "unknown"))

    return AgentReply(
        ok=True,
        text=data.get("text", ""),
        model=data.get("model"),
        input_tokens=data.get("input_tokens"),
        output_tokens=data.get("output_tokens"),
    )


def get_time() -> str:
    from datetime import datetime
    return datetime.now().strftime("%A, %B %d %Y at %H:%M %Z").strip()


def list_agents() -> list[str]:
    from .router import AGENT_IDS
    return list(AGENT_IDS)
