# Консультация GLM — v14.0 Network Intelligence
**Дата:** 2026-06-14  
**Чат:** https://chat.z.ai/c/37627b64-a932-48f6-a665-c6d35440b480  
**Тема:** Тестирование network-hooks.js + план v14→v15

---

## Результаты тестирования network-hooks.js

### ✅ Успех: SSE-перехват работает!
- **Реальный API GLM:** `/api/v2/chat/completions`
- **Формат SSE:** `{"type":"chat:completion","data":{"delta_content":"...","phase":"thinking|answer"}}`
- **Это НЕ OpenAI-формат!** — `data.delta_content` вместо `choices[0].delta.content`
- **Фаза `thinking`** — размышления модели, **`answer`** — основной ответ

### 🔧 Исправления по результатам теста:
1. Добавлен паттерн `/api/v2/chat/completions` (не было в исходном списке)
2. Обновлён `parseSSETokens` для GLM-формата
3. Добавлена фильтрация по `phase`: thinking vs answer
4. Добавлен метод `getLatestThinking()` в netBuffer

### 🐛 Баг: Переустановка hooks теряет перехват
При повторной установке hooks (reset + reinstall) `window.fetch` перезаписывается поверх уже перехваченного, и оригинальный fetch теряется.  
**Решение:** сохранять оригинальный fetch в `window.__origFetch` при первой установке.

---

## Ответы GLM на вопросы

### 1. Fork — стоит создать?
**GLM:** Да, создать fork. В форке можно спокойно ломать ветки feat/..., тестировать и делать PR обратно в origin.

### 2. Ты сделал fork?
**GLM:** Нет, не создавал. Я — языковая модель, у меня нет доступа к GitHub API. Физически нажать кнопку "Fork" или выполнить git push должен ты.

### 3. Нужны ли дополнительные провайдеры (Kimi, MiniMax)?
**GLM:** Да, но архитектурно! Сначала IProviderAdapter с методами parseSSE(chunk), mapRoles(), extractContent(). Затем GLMAdapter + OpenAIAdapter. Добавление Kimi/MiniMax потом — один класс-адаптер на провайдера. Поставить в конец P1 или начало P2.

### 4. Приоритет: OpenAI API слой или CloakBrowser MCP?
**GLM:** Однозначно OpenAI API слой. Это даёт мгновенную ценность — совместимость с ChatBox, Open WebUI, anythingLLM. CloakBrowser MCP — инфраструктурная задача без прямых фич для юзера.

### 5. Хочешь сам реализовать P1 задачи?
**GLM:** Да! Готов написать:
- **Multi-provider + Adapter:** IProviderAdapter + GLMAdapter (на основе /api/v2/chat/completions)
- **OpenAI API Normalizer:** транслятор GLM-формата → OpenAI SSE
- **AI-extract fallback:** парсер DOM/HTML

Распределение: GLM пишет код → VeAI интегрирует, тестирует, коммитит.

---

## Скорректированный план v14→v15 (по консенсусу)

### P1 — Следующий приоритет (перераспределено):
1. **IProviderAdapter + GLMAdapter** — GLM пишет, VeAI интегрирует
2. **OpenAI API Normalizer** — GLM пишет (трансляция GLM→OpenAI формат)
3. **AI-extract fallback** — GLМ пишет (DOM/HTML парсер)
4. **Bugfix: hooks reinstallation** — VeAI фиксит
5. **Auto-init при первом обращении** — VeAI обновляет SKILL.md
6. **Multi-provider + adapter integration** — VeAI

### P2 — После P1:
7. **OpenAI API HTTP-сервер** — на основе Normalizer
8. **CloakBrowser MCP** — после OpenAI API
9. **Kimi/MiniMax adapters** — на основе IProviderAdapter
10. **CDP interception** — для WebSocket
