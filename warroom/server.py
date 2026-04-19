"""War Room voice server.

Two modes:
  - "live" (default): Gemini Live end-to-end speech-to-speech
  - "legacy": Deepgram STT + router + Claude Code + Cartesia TTS

Serves a cinematic HTML UI at `/` on WARROOM_PORT, WebSocket at `/ws`, and a
tiny REST endpoint at `/api/pin` to let the UI pin an agent.
"""
from __future__ import annotations
import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Optional

from aiohttp import web

# Make the package-level imports work when the file is run directly as a
# script (`python warroom/server.py`).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from warroom.config import (  # noqa: E402
    WARROOM_DIR,
    WARROOM_PORT,
    WARROOM_MODE,
    GOOGLE_API_KEY,
    DEEPGRAM_API_KEY,
    CARTESIA_API_KEY,
    load_voices,
)
from warroom.router import route, set_pin  # noqa: E402
from warroom.personas import persona  # noqa: E402
from warroom.agent_bridge import delegate_to_agent  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("warroom")

VOICES = load_voices()

# ── HTML page (served at /) ───────────────────────────────────────
HTML_PATH = WARROOM_DIR / "index.html"


def _write_html_if_needed() -> None:
    """Extract the HTML exported from src/warroom-html.ts into warroom/index.html.

    We do a simple regex grab from the compiled dist file if available, or
    fall back to a minimal page that tells the user to run `npm run build`.
    """
    if HTML_PATH.exists():
        return
    dist_html = WARROOM_DIR.parent / "dist" / "warroom-html.js"
    if dist_html.exists():
        text = dist_html.read_text(encoding="utf-8")
        # Strip ESM export wrapping — keep the backticked template literal.
        import re as _re
        m = _re.search(r"`(<!DOCTYPE html>[\s\S]*?)`;?\s*(?:export|$)", text)
        if m:
            HTML_PATH.write_text(m.group(1), encoding="utf-8")
            return
    HTML_PATH.write_text(
        "<!DOCTYPE html><html><body style='background:#05060a;color:#e6e2d3;font-family:serif;padding:40px'>"
        "<h1>War Room not built yet</h1><p>Run <code>npm run build</code> to generate the UI, then reload.</p>"
        "</body></html>",
        encoding="utf-8",
    )


# ── REST ───────────────────────────────────────────────────────────
async def handle_index(_req: web.Request) -> web.Response:
    _write_html_if_needed()
    return web.FileResponse(HTML_PATH)


async def handle_pin(req: web.Request) -> web.Response:
    try:
        body = await req.json()
    except Exception:
        body = {}
    aid = body.get("agent_id")
    set_pin(aid if isinstance(aid, str) else None)
    return web.json_response({"ok": True, "pinned": aid})


# ── WebSocket pipeline ─────────────────────────────────────────────
class Session:
    """Per-connection voice session.

    In live mode, we proxy audio bytes to Gemini Live and stream audio back.
    In legacy mode, we accumulate audio until Deepgram yields a final
    transcript, then route → Claude Code → Cartesia → audio back.
    """

    def __init__(self, ws: web.WebSocketResponse) -> None:
        self.ws = ws
        self.chat_id = "warroom"
        self._live_task: Optional[asyncio.Task] = None

    async def send_json(self, **kw) -> None:
        try:
            await self.ws.send_json(kw)
        except Exception:
            pass

    async def handle_transcript(self, text: str) -> None:
        """Called by whichever mode produces a final transcript."""
        await self.send_json(type="transcript", text=text)

        decision = route(text)
        targets = decision.agents or list(VOICES.keys())

        async def _one(aid: str) -> None:
            await self.send_json(type="agent_speaking", agent_id=aid)
            reply = await delegate_to_agent(
                aid,
                decision.prompt,
                chat_id=self.chat_id,
                quick=True,
            )
            if not reply.ok:
                await self.send_json(type="agent_text", agent_id=aid, agent_name=VOICES.get(aid, {}).get("name", aid), text=f"(error: {reply.error})")
                return
            await self.send_json(type="agent_text", agent_id=aid, agent_name=VOICES.get(aid, {}).get("name", aid), text=reply.text)
            # TTS handled per-mode below; for legacy mode, we queue it.
            await self._speak(aid, reply.text)

        if len(targets) == 1:
            await _one(targets[0])
        else:
            await asyncio.gather(*(_one(a) for a in targets))

    async def _speak(self, agent_id: str, text: str) -> None:
        """TTS the given text using the right provider for the current mode.

        For now, fall back to browser-side playback only when we actually
        have audio bytes. In live mode, Gemini Live produces audio directly
        in its own stream. In legacy mode, we call Cartesia REST.
        """
        if WARROOM_MODE != "legacy" or not CARTESIA_API_KEY:
            return  # live mode: Gemini's own audio already flowed back
        voice_id = VOICES.get(agent_id, {}).get("cartesia_voice_id")
        if not voice_id:
            return
        # Cartesia /tts/bytes endpoint (REST). Keeping minimal; a production
        # setup would use their WebSocket for lower latency.
        import aiohttp
        payload = {
            "model_id": "sonic-english",
            "voice": {"mode": "id", "id": voice_id},
            "transcript": text,
            "output_format": {"container": "wav", "encoding": "pcm_s16le", "sample_rate": 16000},
        }
        try:
            async with aiohttp.ClientSession() as sess:
                async with sess.post(
                    "https://api.cartesia.ai/tts/bytes",
                    json=payload,
                    headers={
                        "X-API-Key": CARTESIA_API_KEY,
                        "Cartesia-Version": "2024-06-10",
                        "Content-Type": "application/json",
                    },
                ) as resp:
                    if resp.status == 200:
                        audio = await resp.read()
                        await self.ws.send_bytes(audio)
                    else:
                        log.warning("cartesia tts failed: %s", resp.status)
        except Exception as e:
            log.warning("cartesia tts exception: %s", e)


async def handle_ws(req: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse()
    await ws.prepare(req)
    sess = Session(ws)

    # Decide pipeline implementation
    if WARROOM_MODE == "live" and GOOGLE_API_KEY:
        try:
            from warroom.pipeline_live import run_live_session
            await run_live_session(ws, sess)
        except Exception as e:
            log.exception("live pipeline failed: %s", e)
            await sess.send_json(type="status", text=f"Live pipeline failed: {e}")
    else:
        try:
            from warroom.pipeline_legacy import run_legacy_session
            await run_legacy_session(ws, sess)
        except Exception as e:
            log.exception("legacy pipeline failed: %s", e)
            await sess.send_json(type="status", text=f"Legacy pipeline failed: {e}")

    return ws


# ── Main ───────────────────────────────────────────────────────────
def build_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/", handle_index)
    app.router.add_post("/api/pin", handle_pin)
    app.router.add_get("/ws", handle_ws)
    return app


def main() -> None:
    _write_html_if_needed()
    app = build_app()
    log.info("War Room listening on :%d (mode=%s)", WARROOM_PORT, WARROOM_MODE)
    web.run_app(app, host="0.0.0.0", port=WARROOM_PORT, print=None)


if __name__ == "__main__":
    main()
