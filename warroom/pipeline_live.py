"""Gemini Live pipeline — audio in, audio out via google.genai realtime.

Pipecat's full frame system is overkill for our simple browser<->Gemini
proxy; we use the google-genai SDK's `live.connect` API directly and bridge
audio frames between the WS client and Gemini.
"""
from __future__ import annotations
import asyncio
import logging

from aiohttp import web

from .config import GOOGLE_API_KEY
from .agent_bridge import delegate_to_agent
from .router import route
from .personas import persona

log = logging.getLogger("warroom.live")


async def run_live_session(ws: web.WebSocketResponse, sess) -> None:
    """Run a Gemini Live session for the duration of the websocket.

    We send 16kHz PCM audio to Gemini, receive audio + transcripts back, and
    forward those to the browser. Agent delegation happens when Gemini
    finishes transcribing a user turn.
    """
    try:
        from google import genai
        from google.genai import types as gtypes
    except ImportError:
        await sess.send_json(
            type="status",
            text="Install google-genai: pip install google-genai",
        )
        return

    if not GOOGLE_API_KEY:
        await sess.send_json(type="status", text="GOOGLE_API_KEY not set")
        return

    client = genai.Client(
        api_key=GOOGLE_API_KEY,
        http_options=gtypes.HttpOptions(api_version="v1alpha"),
    )
    config = gtypes.LiveConnectConfig(
        response_modalities=["AUDIO"],
        system_instruction=(
            "You are the Council of the Realm — a panel of AI agents "
            "helping Mike Allen. When Mike speaks, decide which councilor "
            "should answer (Main, Research, Comms, Content, Ops, Coach, "
            "Webster) and respond in that voice. For admin tasks, short "
            "answers are better than long ones."
        ),
    )

    try:
        async with client.aio.live.connect(
            model="gemini-2.5-flash-native-audio-latest",
            config=config,
        ) as session:
            await sess.send_json(type="status", text="Gemini Live connected — speak.")

            async def browser_to_gemini() -> None:
                async for msg in ws:
                    if msg.type == web.WSMsgType.BINARY:
                        await session.send_realtime_input(
                            audio=gtypes.Blob(data=msg.data, mime_type="audio/pcm;rate=16000")
                        )
                    elif msg.type in (web.WSMsgType.CLOSE, web.WSMsgType.ERROR):
                        break

            async def gemini_to_browser() -> None:
                async for resp in session.receive():
                    # Audio frames (raw 24kHz PCM16 from Gemini)
                    if resp.data:
                        try:
                            await ws.send_bytes(resp.data)
                        except Exception:
                            break
                    # Text parts (extract without triggering the .text warning)
                    server_content = getattr(resp, "server_content", None)
                    if server_content:
                        model_turn = getattr(server_content, "model_turn", None)
                        if model_turn:
                            for part in getattr(model_turn, "parts", []) or []:
                                t = getattr(part, "text", None)
                                if t:
                                    await sess.send_json(
                                        type="agent_text",
                                        agent_id="main",
                                        agent_name="Council",
                                        text=t,
                                    )

            await asyncio.gather(browser_to_gemini(), gemini_to_browser())
    except Exception as e:
        log.exception("gemini live error: %s", e)
        await sess.send_json(type="status", text=f"Gemini Live error: {e}")
