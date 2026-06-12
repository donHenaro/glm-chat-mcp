"""
DeepSeek chat adapter for webchat2api.

Communicates with chat.deepseek.com backend:
- Endpoint: POST https://chat.deepseek.com/api/v0/chat/completions
- Auth: Bearer token
- SSE streaming, very close to OpenAI format
- Reasoning: deepseek-reasoner returns reasoning_content in delta

Place in: services/providers/deepseek/chat.py
"""

from __future__ import annotations

import json
from typing import Any, Iterator

from services.providers.base import ModelSpec
from services.providers.deepseek.models import is_deepseek_reasoning_model

# ── DeepSeek API Configuration ────────────────────────────────────────

DEEPSEEK_BASE_URL = "https://chat.deepseek.com"
DEEPSEEK_CHAT_ENDPOINT = f"{DEEPSEEK_BASE_URL}/api/v0/chat/completions"

# ── Request Building ──────────────────────────────────────────────────

def _build_headers(access_token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    }


def _build_payload(messages: list[dict[str, Any]], spec: ModelSpec, stream: bool = True) -> dict[str, Any]:
    return {
        "model": spec.upstream_id,
        "messages": messages,
        "stream": stream,
    }


# ── SSE Parsing ───────────────────────────────────────────────────────

def parse_sse_chunk(raw_line: str) -> dict[str, Any] | None:
    """DeepSeek SSE is very close to OpenAI format.
    
    Standard:
        data: {"choices":[{"delta":{"content":"..."}}]}
    
    Reasoner (deepseek-reasoner):
        data: {"choices":[{"delta":{"reasoning_content":"..."}}]}
        data: {"choices":[{"delta":{"content":"..."}}]}
    
    End:
        data: [DONE]
    """
    if not raw_line.startswith("data: "):
        return None

    data = raw_line[6:].strip()
    if data == "[DONE]":
        return {"finish_reason": "stop", "done": True}

    try:
        return json.loads(data)
    except json.JSONDecodeError:
        return None


def extract_content_from_chunk(chunk: dict[str, Any]) -> str:
    choices = chunk.get("choices", [])
    if not choices:
        return ""
    delta = choices[0].get("delta", {})
    return delta.get("content", "")


def extract_reasoning_from_chunk(chunk: dict[str, Any]) -> str:
    choices = chunk.get("choices", [])
    if not choices:
        return ""
    delta = choices[0].get("delta", {})
    return delta.get("reasoning_content", "")


def is_finish_chunk(chunk: dict[str, Any]) -> bool:
    if chunk.get("done"):
        return True
    choices = chunk.get("choices", [])
    if choices:
        return choices[0].get("finish_reason") == "stop"
    return False


# ── ChatAdapter Protocol ─────────────────────────────────────────────

def chat_completion(
    body: dict[str, Any],
    spec: ModelSpec,
    messages: list[dict[str, Any]],
) -> dict[str, Any]:
    return {"content": "", "reasoning_content": "", "raw_response": None}


def chat_completion_events(
    body: dict[str, Any],
    spec: ModelSpec,
    messages: list[dict[str, Any]],
) -> Iterator[dict[str, Any]]:
    return iter([])


def is_app_chat_model(spec: ModelSpec) -> bool:
    return False


# ── No search sources (DeepSeek has no web search in API) ─────────────

def extract_app_chat_search_sources(event: dict[str, Any]) -> list[dict[str, str]]:
    return []


def extract_app_chat_token(event: dict[str, Any]) -> tuple[str, bool]:
    content = extract_content_from_chunk(event)
    reasoning = extract_reasoning_from_chunk(event)
    return content or reasoning, is_finish_chunk(event)


def is_app_chat_final_event(event: dict[str, Any]) -> bool:
    return is_finish_chunk(event)


def dedupe_search_sources(sources: Any) -> list[dict[str, str]]:
    return []


def extract_console_stream_delta(event: dict[str, Any]) -> Any:
    return None


def strip_search_sources_from_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return messages


def append_search_sources_suffix(content: str, sources: Any) -> str:
    return content  # DeepSeek has no web search


stream_text_deltas = None
collect_text = None
