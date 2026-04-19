"""Legacy pipeline: Deepgram streaming STT → router → Claude Code → Cartesia TTS.

Uses Deepgram's streaming SDK for low-latency transcription; on each final
transcript, we invoke the router and the Claude Code bridge.
"""
from __future__ import annotations
import asyncio
import logging

from aiohttp import web

from .config import DEEPGRAM_API_KEY

log = logging.getLogger("warroom.legacy")


async def run_legacy_session(ws: web.WebSocketResponse, sess) -> None:
    if not DEEPGRAM_API_KEY:
        await sess.send_json(type="status", text="DEEPGRAM_API_KEY not set")
        return

    try:
        from deepgram import DeepgramClient, LiveOptions, LiveTranscriptionEvents
    except ImportError:
        await sess.send_json(
            type="status",
            text="Install deepgram SDK: pip install deepgram-sdk",
        )
        return

    dg = DeepgramClient(DEEPGRAM_API_KEY)
    live = dg.listen.asynclive.v("1")

    transcript_queue: asyncio.Queue[str] = asyncio.Queue()

    async def on_message(_self, result, **_kwargs):  # noqa: ANN001
        sentence = result.channel.alternatives[0].transcript if result else ""
        if sentence and result.is_final:
            await transcript_queue.put(sentence)

    async def on_error(_self, error, **_kwargs):  # noqa: ANN001
        log.warning("deepgram error: %s", error)

    live.on(LiveTranscriptionEvents.Transcript, on_message)
    live.on(LiveTranscriptionEvents.Error, on_error)

    opts = LiveOptions(
        model="nova-2-general",
        punctuate=True,
        language="en-US",
        encoding="linear16",
        sample_rate=16000,
        interim_results=False,
        utterance_end_ms=1000,
    )
    await live.start(opts)
    await sess.send_json(type="status", text="Deepgram connected — speak.")

    async def forward_audio() -> None:
        async for msg in ws:
            if msg.type == web.WSMsgType.BINARY:
                await live.send(msg.data)
            elif msg.type in (web.WSMsgType.CLOSE, web.WSMsgType.ERROR):
                break

    async def consume_transcripts() -> None:
        while True:
            text = await transcript_queue.get()
            await sess.handle_transcript(text)

    try:
        await asyncio.gather(forward_audio(), consume_transcripts())
    finally:
        await live.finish()
