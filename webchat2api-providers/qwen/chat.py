"""
Qwen (Alibaba) chat adapter for webchat2api.

Communicates with chat.qwen.ai backend API:
- Endpoint: POST https://chat.qwen.ai/api/v1/chat/completions
- Auth: Bearer token + CSRF token + cookies (cna, cnaui)
- SSE streaming with OpenAI-like format
- Web Search: enabled via extra_body.enable_search or model suffix
- Reasoning: qwq-32b returns <think> tags or reasoning_content

Place in: services/providers/qwen/chat.py
"""

from __future__ import annotations

import json
from typing import Any, Iterator

from services.providers.base import ModelSpec
from services.providers.qwen.models import is_qwen_search_model, is_qwen_reasoning_model

# ── Qwen API Configuration ────────────────────────────────────────────

QWEN_BASE_URL = "https://chat.qwen.ai"
QWEN_CHAT_ENDPOINT = f"{QWEN_BASE_URL}/api/v1/chat/completions"

# ── Request Building ──────────────────────────────────────────────────

def _build_headers(access_token: str, csrf_token: str = "") -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    }
    if csrf_token:
        headers["X-CSRF-Token"] = csrf_token
    return headers


def _build_payload(
    messages: list[dict[str, Any]],
    model: str,
    spec: ModelSpec,
    stream: bool = True,
    enable_search: bool = False,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": spec.upstream_id,
        "messages": messages,
        "stream": stream,
    }

    # Web search activation
    if is_qwen_search_model(spec) or enable_search:
        payload["extra"] = {"web_search": True}

    return payload


# ── SSE Parsing ───────────────────────────────────────────────────────

def parse_sse_chunk(raw_line: str) -> dict[str, Any] | None:
    """Parse SSE data line from Qwen.
    
    Qwen SSE format is close to OpenAI:
        data: {"choices":[{"delta":{"content":"..."}}]}
    
    For reasoning models (qwq):
        data: {"choices":[{"delta":{"reasoning_content":"..."}}]}
    
    Qwen also uses text: prefix in some versions:
        text: {"choices":[{"delta":{"content":"..."}}]}
    
    End marker:
        data: [DONE]
    """
    line = raw_line.strip()
    
    # Handle both "data:" and "text:" prefixes
    for prefix in ("data: ", "text: "):
        if line.startswith(prefix):
            data = line[len(prefix):].strip()
            break
    else:
        return None

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


# ── Search Sources ────────────────────────────────────────────────────

def extract_app_chat_search_sources(event: dict[str, Any]) -> list[dict[str, str]]:
    web_search_info = event.get("web_search_info", [])
    return [
        {"url": r.get("url", ""), "title": r.get("title", ""), "snippet": r.get("snippet", "")}
        for r in web_search_info
    ]


def extract_app_chat_token(event: dict[str, Any]) -> tuple[str, bool]:
    content = extract_content_from_chunk(event)
    reasoning = extract_reasoning_from_chunk(event)
    return content or reasoning, is_finish_chunk(event)


def is_app_chat_final_event(event: dict[str, Any]) -> bool:
    return is_finish_chunk(event)


def dedupe_search_sources(sources: Any) -> list[dict[str, str]]:
    if not isinstance(sources, list):
        return []
    seen = set()
    result = []
    for s in sources:
        url = s.get("url", "")
        if url and url not in seen:
            seen.add(url)
            result.append(s)
    return result


def extract_console_stream_delta(event: dict[str, Any]) -> Any:
    return None


def strip_search_sources_from_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return messages


def append_search_sources_suffix(content: str, sources: Any) -> str:
    if not sources:
        return content
    lines = [content, "", "---", "**Sources:**"]
    for s in sources:
        url = s.get("url", "")
        title = s.get("title", "")
        if url:
            lines.append(f"- [{title or url}]({url})")
    return "\n".join(lines)


stream_text_deltas = None
collect_text = None
