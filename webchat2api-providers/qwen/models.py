"""
Qwen (Alibaba) provider models for webchat2api.

Maps Qwen web-chat models to ModelSpec entries.

Place in: services/providers/qwen/models.py
"""

from __future__ import annotations

from services.providers.base import QWEN_PROVIDER, ModelSpec

QWEN_MODEL_SPECS = (
    # Main chat models
    ModelSpec("qwen-max-latest", QWEN_PROVIDER, "alibaba", "qwen-max-latest"),
    ModelSpec("qwen-plus-latest", QWEN_PROVIDER, "alibaba", "qwen-plus-latest"),
    ModelSpec("qwen-turbo-latest", QWEN_PROVIDER, "alibaba", "qwen-turbo-latest"),

    # Reasoning model (analog of o1)
    ModelSpec("qwq-32b", QWEN_PROVIDER, "alibaba", "qwq-32b", mode_id="reasoning"),

    # Code-specialized model
    ModelSpec("qwen2.5-coder-32b-instruct", QWEN_PROVIDER, "alibaba", "qwen2.5-coder-32b-instruct", mode_id="code"),

    # Vision model
    ModelSpec("qwen2.5-vl-32b-instruct", QWEN_PROVIDER, "alibaba", "qwen2.5-vl-32b-instruct", mode_id="vision"),

    # Long context model
    ModelSpec("qwen2.5-14b-instruct-1m", QWEN_PROVIDER, "alibaba", "qwen2.5-14b-instruct-1m", mode_id="long-context"),

    # Web search enhanced variants
    ModelSpec("qwen-max-latest-search", QWEN_PROVIDER, "alibaba", "qwen-max-latest", mode_id="search"),
    ModelSpec("qwen-plus-latest-search", QWEN_PROVIDER, "alibaba", "qwen-plus-latest", mode_id="search"),
)

QWEN_CHAT_MODEL_IDS = {spec.id for spec in QWEN_MODEL_SPECS}
QWEN_IMAGE_MODEL_IDS: set[str] = set()  # Qwen image not yet supported


def qwen_model_metadata() -> list[dict[str, object]]:
    return [spec.model_metadata() for spec in QWEN_MODEL_SPECS]


def is_qwen_search_model(spec: ModelSpec) -> bool:
    return spec.provider == QWEN_PROVIDER and spec.mode_id == "search"


def is_qwen_reasoning_model(spec: ModelSpec) -> bool:
    return spec.provider == QWEN_PROVIDER and spec.mode_id == "reasoning"
