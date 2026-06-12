"""DeepSeek provider for webchat2api."""

from services.providers.deepseek.models import DEEPSEEK_MODEL_SPECS, DEEPSEEK_CHAT_MODEL_IDS
from services.providers.deepseek.accounts import normalize_access_token, normalize_account
from services.providers.deepseek.chat import chat_completion, chat_completion_events, is_app_chat_model
