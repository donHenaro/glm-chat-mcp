# webchat2api Provider Extensions — GLM, Qwen, DeepSeek

Этот каталог содержит провайдер-модули для расширения [webchat2api](https://github.com/zqbxdev/webchat2api) поддержкой GLM (ZhiPu AI), Qwen (Alibaba) и DeepSeek.

## Структура

```
webchat2api-providers/
├── glm/
│   ├── __init__.py       # Публичный API модуля
│   ├── models.py         # ModelSpec для GLM моделей
│   ├── accounts.py       # AccountAdapter: cookie/token авторизация
│   └── chat.py           # ChatAdapter: SSE streaming к chat.z.ai
├── qwen/
│   ├── __init__.py
│   ├── models.py         # ModelSpec для Qwen моделей
│   ├── accounts.py       # AccountAdapter: JWT + CSRF + cookies
│   └── chat.py           # ChatAdapter: SSE streaming к chat.qwen.ai
├── deepseek/
│   ├── __init__.py
│   ├── models.py         # ModelSpec для DeepSeek моделей
│   ├── accounts.py       # AccountAdapter: session_token + JWT
│   └── chat.py           # ChatAdapter: SSE streaming к chat.deepseek.com
└── patches/
    ├── base.py.patch     # Патч: добавить константы GLM/QWEN/DEEPSEEK_PROVIDER
    └── registry.py.patch # Патч: зарегистрировать новые провайдеры
```

## Установка в webchat2api

### Шаг 1: Скопировать провайдеры

```bash
# В корне клонированного webchat2api
cp -r webchat2api-providers/glm   services/providers/glm
cp -r webchat2api-providers/qwen  services/providers/qwen
cp -r webchat2api-providers/deepseek services/providers/deepseek
```

### Шаг 2: Применить патчи

Изменить `services/providers/base.py`:
- Добавить константы `GLM_PROVIDER = "glm"`, `QWEN_PROVIDER = "qwen"`, `DEEPSEEK_PROVIDER = "deepseek"`
- Обновить `SUPPORTED_PROVIDERS`

Изменить `services/providers/registry.py`:
- Добавить импорты GLM/Qwen/DeepSeek моделей
- Обновить `_PROVIDER_MODEL_SPECS`, `_PROVIDER_OWNERS`, `_PROVIDER_CAPABILITIES`
- Обновить `normalize_provider()` для распознавания новых имён

См. детали в `patches/`.

### Шаг 3: Добавить аккаунты

Через Web UI webchat2api (http://localhost:83/accounts):
- **GLM**: Импорт с `provider=glm`, вставить access_token или zai_token
- **Qwen**: Импорт с `provider=qwen`, вставить JWT Bearer token
- **DeepSeek**: Импорт с `provider=deepseek`, вставить session_token

### Шаг 4: Тестирование

```bash
# Список моделей (должны появиться glm-*, qwen-*, deepseek-*)
curl http://localhost:83/v1/models -H "Authorization: Bearer admin"

# GLM чат
curl http://localhost:83/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer admin" \
  -d '{"model": "glm-5.1", "messages": [{"role": "user", "content": "Привет"}]}'

# Qwen чат
curl http://localhost:83/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer admin" \
  -d '{"model": "qwen-max-latest", "messages": [{"role": "user", "content": "Привет"}]}'

# DeepSeek чат
curl http://localhost:83/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer admin" \
  -d '{"model": "deepseek-chat", "messages": [{"role": "user", "content": "Привет"}]}'
```

## Поддерживаемые модели

### GLM (ZhiPu AI)
| Модель | Описание |
|--------|----------|
| `glm-5.1` | Флагманская модель |
| `glm-5` | Предыдущая версия |
| `glm-5-turbo` | Быстрая версия |
| `glm-4.7` | Старая модель |
| `glm-5.1-deepthink` | Режим глубокого мышления |
| `glm-5.1-agent` | Агентский режим (tool use) |
| `glm-5.1-search` | С веб-поиском |

### Qwen (Alibaba)
| Модель | Описание |
|--------|----------|
| `qwen-max-latest` | Флагманская модель |
| `qwen-plus-latest` | Баланс скорости/качества |
| `qwen-turbo-latest` | Быстрая модель |
| `qwq-32b` | Reasoning модель (аналог o1) |
| `qwen2.5-coder-32b-instruct` | Специализированная для кода |
| `qwen-max-latest-search` | С веб-поиском |

### DeepSeek
| Модель | Описание |
|--------|----------|
| `deepseek-chat` | Стандартный чат |
| `deepseek-reasoner` | Reasoning модель (R1) |

## Статус реализации

| Компонент | Статус | Примечание |
|-----------|--------|------------|
| models.py (GLM/Qwen/DeepSeek) | ✅ Готов | ModelSpec определены |
| accounts.py (GLM/Qwen/DeepSeek) | ✅ Готов | AccountAdapter реализован |
| chat.py (GLM/Qwen/DeepSeek) | ⚠️ Stub | SSE parsing готов, HTTP-вызов — stub |
| base.py patch | ✅ Готов | Константы добавлены |
| registry.py patch | ✅ Готов | Регистрация описана |
| HTTP runtime (chat completion) | ⏳ TODO | Нужен httpx/aiohttp клиент |
| Token refresh | ⏳ TODO | Фоновый refresh цикл |
| Тестирование | ⏳ TODO | Unit + integration тесты |

## Консультации

Результаты консультаций с провайдерами хранятся в логах:
- GLM: `log/2026-06-12/glm-chat-log-2026-06-12.md` (UUID: 74d5700a, b534fd07)
- Qwen: `log/2026-06-12/qwen-chat-log-2026-06-12.md` (UUID: 9999cf8a, 25afd4a7)
