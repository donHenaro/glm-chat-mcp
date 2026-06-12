"""
DeepSeek provider models for webchat2api.

Models available via chat.deepseek.com:
- deepseek-chat: standard chat
- deepseek-reasoner: reasoning model (R1-style)

Place in: services/providers/deepseek/models.py
"""

from __future__ import annotations

from services.providers.base import DEEPSEEK_PROVIDER, ModelSpec

DEEPSEEK_MODEL_SPECS = (
    # Standard chat
    ModelSpec("deepseek-chat", DEEPSEEK_PROVIDER, "deepseek", "deepseek-chat"),

    # Reasoning model (R1-style chain-of-thought)
    ModelSpec("deepseek-reasoner", DEEPSEEK_PROVIDER, "deepseek", "deepseek-reasoner", mode_id="reasoning"),
)

DEEPSEEK_CHAT_MODEL_IDS = {spec.id for spec in DEEPSEEK_MODEL_SPECS}
DEEPSEEK_IMAGE_MODEL_IDS: set[str] = set()


def deepseek_model_metadata() -> list[dict[str, object]]:
    return [spec.model_metadata() for spec in DEEPSEEK_MODEL_SPECS]


def is_deepseek_reasoning_model(spec: ModelSpec) -> bool:
    return spec.provider == DEEPSEEK_PROVIDER and spec.mode_id == "reasoning"
