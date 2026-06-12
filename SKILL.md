---
name: "glm-chat-mcp"
schemaVersion: "v1.0"
description: "MANDATORY ACTIVATION when user says: 'zai', 'спроси glm', 'ask glm', 'обсуди с qwen', 'ask qwen', 'спроси deepseek', 'ask deepseek', 'deepseek'. GLM/Qwen/DeepSeek chat skill with Copy/Regenerate detection. Works with VeAI plugin for IntelliJ IDEA."
agent: null
used-by:
 - "Agent"
 - "Code"
---
# when refactoring, never make changes above this line.
# GLM Chat MCP Skill v10.0 — Compact Edition
---

## 🔴 Обязательная активация

| Провайдер | Триггеры |
|-----------|----------|
| **GLM** | `zai`, `спроси glm`, `ask glm`, `реализуй`, `создай`, `агент`, `исследуй` |
| **Qwen** | `qwen`, `спроси qwen`, `ask qwen`, `обсуди с qwen` |
| **DeepSeek** | `deepseek`, `спроси deepseek`, `ask deepseek` |

⛔ Не создавать .js файлы — только Playwright MCP инструменты
⛔ Не закрывать браузер после консультации
✅ Браузер уже открыт — сначала проверить состояние

---

## 🏛️ Архитектура

**UI-отправка + Copy/Regenerate Detection** — единая стратегия для всех провайдеров.

Все 3 провайдера используют защитные механизмы (X-Signature, PoW, Message Tree),
поэтому прямой API **не рекомендуется**. Отправка через UI — подписи обрабатываются автоматически.

**Chat Mode vs Agent Mode (GLM):**
- Chat Mode: 5-15 сек, один шаг, генерация текста
- Agent Mode: 1-5 мин, многошаговый, выполнение действий с инструментами (web_search, code_execution, browser_automation, file_operations)

---

## 🔄 Workflow — 7 шагов

### 1. Определить провайдера и режим
Триггер → провайдер. Agent Mode триггеры: `найди`, `проанализируй`, `выполни код`, `исследуй`, `agent`

### 2. Проверить лог, найти существующий чат
`log/YYYY-MM-DD/<provider>-chat-log-YYYY-MM-DD.md` → если есть по теме — перейти на URL

### 3. Переключиться на вкладку провайдера

| Провайдер | URL |
|-----------|-----|
| GLM | `https://chat.z.ai/c/<UUID>` |
| Qwen | `https://chat.qwen.ai/c/<UUID>` |
| DeepSeek | `https://chat.deepseek.com/a/chat/s/<UUID>` |

### 4. Выбрать режим (при необходимости)
`browser_snapshot` → кнопка режима → `browser_click`

| GLM | Qwen | DeepSeek |
|-----|------|----------|
| Agent / Deep Think / Web Search | Search toggle / Model select | DeepThink toggle |

### 5. Отправить сообщение
`browser_click` textarea → `browser_type` текст → `browser_press_key` Enter

### 6. Ожидание ответа — двухфазный детектор

**Фаза 1 (0-15 сек):** Ждём Stop → генерация началась
**Фаза 2 (до timeout):** Ждём Copy/Regenerate стабильны 3 сек → ответ готов

⚠️ Agent Mode: между tool calls кнопки могут мигнуть — подождать 3 сек и перепроверить.

**Фаза 1 не прошла за 15 сек?** Проверить: ошибка в DOM? редирект на /login? retry 1 раз.

### 7. Прочитать ответ и записать лог
```javascript
const msgs = document.querySelectorAll('.chat-assistant .markdown-prose');
const text = msgs[msgs.length - 1]?.innerText || '';
```

---

## 🎯 Response Detection — детализация

### Иерархия надёжности (по данным GLM)

| Приоритет | Индикатор | Надёжность | Примечание |
|:---------:|-----------|:----------:|------------|
| 🥇 1 | Copy / Regenerate кнопки | ⭐⭐⭐⭐⭐ | Пост-рендерный сигнал — только после полного завершения |
| 🥈 2 | Исчезновение Stop | ⭐⭐⭐⭐ | Надёжно, но задержка перед Copy |
| 🥉 3 | Исчезновение thinking | ⭐⭐⭐ | Доп. сигнал, не самостоятельный |
| 4 | innerText.length стабильность | ⭐⭐ | Fallback — ложные срабатывания при Agent Mode паузах |

### Селекторы по провайдерам

| Сигнал | GLM | Qwen | DeepSeek |
|--------|-----|------|----------|
| Генерация идёт | `button[aria-label*="Stop"]` | `button:has-text("Stop")` | `button:has-text("Stop")` |
| Thinking | `[class*="thinking"]` | `"Generating..."` | `[class*="thinking"]` |
| Готово | `button:has-text("Copy")` | `button:has-text("Copy")` | `button:has-text("Copy")` |
| Ошибка | красный toast/alert | текст в сообщении | красный баннер |

### Таймауты по режиму

| Режим | Таймаут | Обычно |
|-------|---------|--------|
| Chat | 60 сек | 5-15 сек |
| Deep Think | 120 сек | 30-90 сек |
| Agent Mode | 300 сек | 1-5 мин |

---

## 🤖 GLM Agent Mode

Agent Mode — автономный агент с инструментами. Составляет план и пошагово выполняет.

**Инструменты:** web_search, code_execution, browser_automation, file_operations, mcp_servers

**Сценарии:** исследование документации → анализ файлов → выполнение кода → генерация файлов → автоматизированные цепочки

⚠️ **beforeunload:** Agent Mode browser_automation может вызвать диалог блокировки Playwright.
Решение: использовать Copy/Regenerate detection (не патчим fetch).

**Рекомендации:**
| Ситуация | Режим | Причина |
|----------|-------|---------|
| Простой вопрос / код-ревью | Chat Mode | 5-15 сек |
| Веб-поиск | Agent Mode | web_search |
| Анализ файла | Agent Mode | file_operations + Vision |
| Выполнить код | Agent Mode | code_execution |
| Многошаговая задача | Agent Mode | agent loop с tools |

**Ограничения:** sandbox (нет ФС), нет git, нет прямого HTTP, таймаут ~5 мин, beforeunload

---

## 🔄 Мультитурновые диалоги

Все провайдеры хранят контекст на сервере. Просто оставаться на том же URL чата и отправлять следующие сообщения. Не создавать новые чаты без необходимости.

---

## 📎 Файлы

**GLM/Qwen:** Upload через UI (кнопка "+" → Upload)
**DeepSeek:** `input[type=file]` + DataTransfer API через `browser_evaluate`
**Поддерживаемые форматы:** .pdf, .docx, .xlsx, .pptx, .txt, .md, .py, изображения

---

## 📋 Режимы провайдеров — единая таблица

| Режим | GLM (features) | Qwen (feature_config) | DeepSeek (model) |
|-------|----------------|----------------------|-------------------|
| Обычный | по умолчанию | `thinking_enabled:false` | `deepseek-chat` |
| Deep Think | `enable_thinking:true` + `reasoning_effort:"max"` | `thinking_enabled:true, thinking_mode:"Deep"` | `deepseek-reasoner` |
| Web Search | `web_search:true` | `auto_search:true` | Search toggle |
| Agent | `flags:["general_agent"]` | — | — |

---

## ❌ Ошибки и Recovery

| Ситуация | Действие |
|----------|----------|
| Stop не появилась за 15 сек | Проверить DOM ошибки, login redirect, retry 1 раз |
| Copy/Regenerate мигнули и исчезли | Agent Mode — продолжить ожидание |
| beforeunload диалог | Закрыть вкладку, открыть заново |
| Редирект на /login | Предупредить пользователя — нужна авторизация |
| Ответ неполный (ошибка генерации) | innerText.length fallback — проверить текст на обрыв |

---

## 📋 Лог чатов

`log/YYYY-MM-DD/<provider>-chat-log-YYYY-MM-DD.md`

```
| [дата] | [время] | [UUID] | [тема] | [URL] | [провайдер] | [режим] | ✅ |
```

---

## 🏗️ Архитектура проекта

```
glm-chat-mcp/                     ← https://github.com/donHenaro/glm-chat-mcp
├── SKILL.md                      ← инструкции агента (этот файл)
├── reference.md                  ← техническая справка API
└── log/                          ← логи чатов
```

### Репозиторий: https://github.com/donHenaro/glm-chat-mcp.git

---

## 📋 Changelog

### v10.0.0 (current) — Copy/Regenerate Detection + Compact

**Breaking changes:**
- Response detection: bubble-reading → Copy/Regenerate buttons
- Двухфазный детектор: Фаза 1 (Stop) → Фаза 2 (Copy/Regenerate stable 3 сек)
- SSE-intercept вынесен в reference.md
- SKILL.md сжат: 756 → 200 строк

### v9.2 — bubble-reading, Agent Mode docs

### v9.0 — multiturn, files, Agent Mode, dead code cleanup (45 files removed)

### v8.0 — direct API access, no webchat2api dependency

### v7.0 — dual-mode architecture, DeepSeek provider
