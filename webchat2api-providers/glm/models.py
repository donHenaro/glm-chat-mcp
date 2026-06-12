"""
GLM (ZhiPu AI) provider models for webchat2api.

Maps GLM web-chat models to ModelSpec entries compatible with
the webchat2api provider registry.

Place in: services/providers/glm/models.py
"""

from __future__ import annotations

from services.providers.base import GLM_PROVIDER, ModelSpec

# ── GLM text model specs ──────────────────────────────────────────────

GLM_MODEL_SPECS = (
    # Standard chat models
    ModelSpec("glm-5.1", GLM_PROVIDER, "zhipu", "glm-5.1"),
    ModelSpec("glm-5", GLM_PROVIDER, "zhipu", "glm-5"),
    ModelSpec("glm-5-turbo", GLM_PROVIDER, "zhipu", "glm-5-turbo"),
    ModelSpec("glm-4.7", GLM_PROVIDER, "zhipu", "glm-4.7"),
    ModelSpec("glm-4", GLM_PROVIDER, "zhipu", "glm-4"),

    # Deep Think variants — reasoning models (mode_id signals special upstream path)
    ModelSpec("glm-5.1-deepthink", GLM_PROVIDER, "zhipu", "glm-5.1", mode_id="deepthink"),
    ModelSpec("glm-5-deepthink", GLM_PROVIDER, "zhipu", "glm-5", mode_id="deepthink"),

    # Agent mode — tool-use orchestration (mode_id signals Agent Mode path)
    ModelSpec("glm-5.1-agent", GLM_PROVIDER, "zhipu", "glm-5.1", mode_id="agent"),
    ModelSpec("glm-5-agent", GLM_PROVIDER, "zhipu", "glm-5", mode_id="agent"),

    # Web Search — enhanced with web search tool
    ModelSpec("glm-5.1-search", GLM_PROVIDER, "zhipu", "glm-5.1", mode_id="search"),
    ModelSpec("glm-5-search", GLM_PROVIDER, "zhipu", "glm-5", mode_id="search"),
)

GLM_CHAT_MODEL_IDS = {spec.id for spec in GLM_MODEL_SPECS}
GLM_IMAGE_MODEL_IDS: set[str] = set()  # GLM image not yet supported via API


def glm_model_metadata() -> list[dict[str, object]]:
    """Return model metadata for /v1/models endpoint."""
    return [spec.model_metadata() for spec in GLM_MODEL_SPECS]


def is_glm_deepthink(spec: ModelSpec) -> bool:
    return spec.provider == GLM_PROVIDER and spec.mode_id == "deepthink"


def is_glm_agent(spec: ModelSpec) -> bool:
    return spec.provider == GLM_PROVIDER and spec.mode_id == "agent"


def is_glm_search(spec: ModelSpec) -> bool:
    return spec.provider == GLM_PROVIDER and spec.mode_id == "search"
