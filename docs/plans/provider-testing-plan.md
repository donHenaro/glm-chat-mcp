# План тестирования провайдеров: Qwen → DeepSeek → Kimi

## Общая методология

Для каждого провайдера — 5 этапов проверки:
1. **Навигация** — открываем чат, проверяем авторизацию
2. **Селекторы** — healthCheck(): input, response, spinner, done
3. **Отправка** — adapter.send("тестовый промпт")
4. **Network hooks** — перехват SSE, парсинг токенов
5. **Чтение ответа** — adapter.read() + OpenAI-нормализация

---

## 1. Qwen (chat.qwen.ai)

### 1.1 Навигация и авторизация
- [ ] browser_navigate → https://chat.qwen.ai
- [ ] Проверить: авторизован ли пользователь?
- [ ] Если нет — запросить у пользователя логин

### 1.2 Селекторы (healthCheck)
Текущие предположения (НЕ проверены на реальном сайте):
- input: `textarea.message-input-textarea`
- response: `[class*="message-content"]`
- spinner: `[class*="loading"]`
- done: `text-buttons`, copyText: "Copy"

**Риск**: селекторы могут не совпадать — Qwen обновляет UI часто.
**План Б**: browser_snapshot → анализ accessibility tree → обновление селекторов

### 1.3 Network Hooks
Текущие паттерны: `['/api/chat/', '/api/conversation/', '/completions']`
**Риск**: реальный API Qwen может использовать другие URL.
**План**: проверить через browser_network_requests после отправки

### 1.4 SSE формат
Предположение: OpenAI-совместимый `{choices:[{delta:{content}}]}`
или альтернативный `{output:{text, finish_reason}}`
**Риск**: формат может отличаться
**План**: проверить body из __netBuffer

### 1.5 Тестовые сценарии
- [ ] T1: Короткий ответ ("Скажи ОК")
- [ ] T2: Средний ответ ("3 преимущества TypeScript")
- [ ] T3: Thinking/Deep Think режим (если доступен)

---

## 2. DeepSeek (chat.deepseek.com)

### 2.1 Навигация и авторизация
- [ ] browser_navigate → https://chat.deepseek.com
- [ ] Проверить авторизацию

### 2.2 Селекторы (healthCheck)
Текущие предположения:
- input: `textarea`
- response: `.ds-markdown`
- spinner: `[class*="loading"]`
- done: `text-buttons`, copyText: "Copy"

**Риск**: `textarea` — слишком широкий селектор, может совпасть с другими полями

### 2.3 Network Hooks
Текущие паттерны: `['/api/chat/', '/api/v0/chat/', '/completions']`
**Риск**: DeepSeek может использовать `/api/v1/chat/completions`

### 2.4 SSE формат
Предположение: OpenAI-совместимый с `reasoning_content` для thinking
**Риск**: DeepSeek может обновить формат

### 2.5 Тестовые сценарии
- [ ] T1: Короткий ответ ("Скажи ОК")
- [ ] T2: DeepThink режим — проверить reasoning_content
- [ ] T3: Поиск (если доступен)

---

## 3. Kimi (kimi.moonshot.cn) — НОВЫЙ провайдер

### 3.1 Исследование
- [ ] Открыть https://kimi.moonshot.cn
- [ ] Определить: авторизация, UI структура, селекторы
- [ ] Выявить API-эндпоинты через browser_network_requests
- [ ] Определить SSE формат

### 3.2 Реализация
- [ ] Добавить селекторы в PROVIDERS (provider-adapter.js)
- [ ] Добавить API_PATTERNS в network-hooks.js
- [ ] Создать KimiAdapter (если SSE формат отличается)
- [ ] Добавить в ADAPTER_MAP и provider detection
- [ ] Добавить модель в openai-bridge.js PROVIDERS

### 3.3 Тестовые сценарии
- [ ] T1: Короткий ответ
- [ ] T2: Сложный запрос
- [ ] T3: Поиск (Kimi известен web search)

---

## Порядок выполнения

1. **Qwen** — полная проверка, исправление селекторов/API-паттернов/SSE-формата
2. **DeepSeek** — полная проверка, исправление селекторов/API-паттернов/SSE-формата
3. **Kimi** — исследование + реализация с нуля

Каждый провайдер → коммит с результатами.
