"""Routing: given a transcribed user message, decide which agent(s) handle it.

Priority:
  1. Broadcast triggers ("everyone", "all agents", "everybody")
  2. Name prefix ("hey Comms, ...", "Ops:", "@research ...")
  3. Pinned agent (UI-pinned via /tmp/warroom-pin.json)
  4. Default to Main
"""
from __future__ import annotations
import json
import re
from dataclasses import dataclass
from typing import List, Optional

from .config import PIN_FILE

BROADCAST_TRIGGERS = [
    "everyone", "everybody", "all agents", "all of you", "council",
]

AGENT_IDS = ["main", "research", "comms", "content", "ops", "coach", "webster"]
NAME_PREFIXES = {
    "main": ["main", "hand", "the hand"],
    "research": ["research", "maester", "grand maester"],
    "comms": ["comms", "whisperers", "master of whisperers"],
    "content": ["content", "bard", "royal bard"],
    "ops": ["ops", "master of war"],
    "coach": ["coach", "coach allen"],
    "webster": ["webster", "ravens", "master of ravens"],
}


@dataclass
class Route:
    agents: List[str]  # [] = broadcast
    prompt: str
    reason: str


def _read_pin() -> Optional[str]:
    try:
        data = json.loads(PIN_FILE.read_text(encoding="utf-8"))
        return data.get("agent_id")
    except Exception:
        return None


def _match_prefix(text: str) -> Optional[tuple[str, str]]:
    """Look for '@<agent>' or 'hey <name>' or '<name>:' at the start."""
    t = text.strip()
    m = re.match(r"^@([a-z][a-z0-9_-]{0,29})[\s,:]+(.*)", t, re.I)
    if m and m.group(1).lower() in AGENT_IDS:
        return m.group(1).lower(), m.group(2)

    m = re.match(r"^(?:hey\s+|okay\s+|alright\s+)?([a-z ]+?)[:,]\s+(.*)", t, re.I)
    if m:
        candidate = m.group(1).lower().strip()
        for aid, names in NAME_PREFIXES.items():
            if candidate in names:
                return aid, m.group(2)
    return None


def route(text: str) -> Route:
    if not text:
        return Route(agents=["main"], prompt=text, reason="empty")

    low = text.lower()

    for trig in BROADCAST_TRIGGERS:
        if trig in low:
            return Route(agents=[], prompt=text, reason=f"broadcast:{trig}")

    prefix = _match_prefix(text)
    if prefix:
        return Route(agents=[prefix[0]], prompt=prefix[1], reason="name_prefix")

    pin = _read_pin()
    if pin and pin in AGENT_IDS:
        return Route(agents=[pin], prompt=text, reason=f"pinned:{pin}")

    return Route(agents=["main"], prompt=text, reason="default")


def set_pin(agent_id: Optional[str]) -> None:
    if agent_id is None:
        try:
            PIN_FILE.unlink()
        except FileNotFoundError:
            pass
        return
    PIN_FILE.write_text(json.dumps({"agent_id": agent_id}), encoding="utf-8")
