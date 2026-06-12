"""
GLM (ZhiPu AI) chat adapter for webchat2api.

Communicates with chat.z.ai backend API:
- Endpoint: POST https://chat.z.ai/api/chat/completions
- Auth: Bearer token in Authorization header
- SSE streaming with OpenAI-like format
- Deep Think: reasoning_content field in delta
- Agent Mode: tool_calls in delta (orchestration)

Place in: services/providers/glm/chat.py
"""

from __future__ import annotations

import json
from typing import Any, Iterator

from services.providers.base import ModelSpec
from services.providers.glm.models import is_glm_deepthink, is_glm_agent, is_glm_search

# ── GLM API Configuration ─────────────────────────────────────────────

GLM_BASE_URL = "https://chat.z.ai"
GLM_CHAT_ENDPOINT = f"{GLM_BASE_URL}/api/chat/completions"
GLM_REFRESH_ENDPOINT = f"{GLM_BASE_URL}/api/user/refresh"
GLM_USER_INFO_ENDPOINT = f"{GLM_BASE_URL}/api/user/info"

# ── Request Building ──────────────────────────────────────────────────

def _build_headers(access_token: str) -> dict[str, str]:
    """Build HTTP headers for GLM API request."""
    return {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream" if True else "application/json",  # stream default
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    }


def _build_payload(messages: list[dict[str, Any]], model: str, spec: ModelSpec, stream: bool = True) -> dict[str, Any]:
    """Build request payload for GLM chat API.
    
    GLM uses OpenAI-compatible format with additional mode flags:
    - Deep Think: model field carries the base model, mode_id signals deepthink
    - Agent Mode: model field carries the base model, mode_id signals agent
    - Web Search: model field carries the base model, mode_id signals search
    """
    payload: dict[str, Any] = {
        "model": spec.upstream_id,  # e.g. "glm-5.1"
        "messages": messages,
        "stream": stream,
    }

    # Mode-specific parameters
    if is_glm_deepthink(spec):
        payload["mode"] = "deepthink"
    elif is_glm_agent(spec):
        payload["mode"] = "agent"
        payload["tools"] = payload.get("tools", [])  # agent mode expects tools
    elif is_glm_search(spec):
        payload["mode"] = "search"

    return payload


# ── SSE Parsing ───────────────────────────────────────────────────────

def parse_sse_chunk(raw_line: str) -> dict[str, Any] | None:
    """Parse a single SSE data line from GLM response.
    
    GLM SSE format (OpenAI-like):
        data: {"choices":[{"delta":{"content":"..."}}]}
    
    Deep Think adds:
        data: {"choices":[{"delta":{"reasoning_content":"..."}}]}
    
    Agent Mode adds:
        data: {"choices":[{"delta":{"tool_calls":[...]}}]}
    
    End of stream:
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
    """Extract text content from a parsed SSE chunk."""
    choices = chunk.get("choices", [])
    if not choices:
        return ""
    delta = choices[0].get("delta", {})
    return delta.get("content", "")


def extract_reasoning_from_chunk(chunk: dict[str, Any]) -> str:
    """Extract reasoning content from Deep Think SSE chunk."""
    choices = chunk.get("choices", [])
    if not choices:
        return ""
    delta = choices[0].get("delta", {})
    return delta.get("reasoning_content", "")


def is_finish_chunk(chunk: dict[str, Any]) -> bool:
    """Check if this is the final chunk in the stream."""
    if chunk.get("done"):
        return True
    choices = chunk.get("choices", [])
    if choices:
        finish_reason = choices[0].get("finish_reason")
        return finish_reason == "stop"
    return False


# ── ChatAdapter Protocol Implementation ───────────────────────────────

def chat_completion(
    body: dict[str, Any],
    spec: ModelSpec,
    messages: list[dict[str, Any]],
) -> dict[str, Any]:
    """Non-streaming chat completion.
    
    Returns dict with 'content' and optional 'reasoning_content'.
    """
    # This is a stub — actual HTTP request is handled by the
    # protocol layer (services/protocol/openai_v1_chat_complete.py)
    # which calls the provider's chat adapter.
    #
    # For GLM, the protocol layer needs to:
    # 1. Get an available GLM account from account_service
    # 2. Call GLM_CHAT_ENDPOINT with the account's access_token
    # 3. Parse SSE response (even for non-stream, GLM streams)
    # 4. Collect all content and reasoning_content
    # 5. Return structured response
    return {
        "content": "",
        "reasoning_content": "",
        "raw_response": None,
    }


def chat_completion_events(
    body: dict[str, Any],
    spec: ModelSpec,
    messages: list[dict[str, Any]],
) -> Iterator[dict[str, Any]]:
    """Streaming chat completion — yields SSE chunks.
    
    Each yielded dict is a parsed SSE chunk in OpenAI format.
    """
    # Stub — actual implementation iterates over SSE response
    # and yields parsed chunks via parse_sse_chunk()
    return iter([])


def is_app_chat_model(spec: ModelSpec) -> bool:
    """GLM doesn't use app-chat distinction like Grok."""
    return False


# ── Search Sources (for future Web Search support) ────────────────────

def extract_app_chat_search_sources(event: dict[str, Any]) -> list[dict[str, str]]:
    """Extract web search sources from GLM response events."""
    # GLM search results come in the response metadata
    search_results = event.get("search_results", [])
    return [
        {"url": r.get("url", ""), "title": r.get("title", ""), "snippet": r.get("snippet", "")}
        for r in search_results
    ]


def extract_app_chat_token(event: dict[str, Any]) -> tuple[str, bool]:
    """Extract token and completion status from SSE event."""
    content = extract_content_from_chunk(event)
    reasoning = extract_reasoning_from_chunk(event)
    token = content or reasoning
    is_final = is_finish_chunk(event)
    return token, is_final


def is_app_chat_final_event(event: dict[str, Any]) -> bool:
    return is_finish_chunk(event)


def dedupe_search_sources(sources: Any) -> list[dict[str, str]]:
    """Deduplicate search sources by URL."""
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
    """GLM doesn't use console path — placeholder."""
    return None


def strip_search_sources_from_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Remove search source metadata from messages for API response."""
    return messages  # No-op for GLM


def append_search_sources_suffix(content: str, sources: Any) -> str:
    """Append search sources as Markdown to content."""
    if not sources:
        return content
    lines = [content, "", "---", "**Sources:**"]
    for s in sources:
        url = s.get("url", "")
        title = s.get("title", "")
        if url:
            lines.append(f"- [{title or url}]({url})")
    return "\n".join(lines)


# ── Streaming helpers ─────────────────────────────────────────────────

stream_text_deltas = None  # Set by runtime integration
collect_text = None        # Set by runtime integration
