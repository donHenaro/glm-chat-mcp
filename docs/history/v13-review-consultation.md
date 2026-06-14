# Консультация v13.0 → v13.2: Ревью кода всеми провайдерами

## Дата: 2025-06-12

## GLM (чат 86515cb8 / 1920e7ee)

### Ключевые рекомендации:
1. 🔴 **JS вынести в scripts/** — SKILL.md не должен быть JS-контейнером
2. 🔴 **detect + extract → объединить** в response.js
3. 🔴 **blob-download: try/finally** — URL.createObjectURL не восстанавливался
4. 🟡 **multi-provider: document.querySelectorAll** — ошибка контекста (другой tab)
5. 🟡 **_meta.json changelog** — не обновлён
6. 🟡 **needsContextRepeat()** — слишком наивный
7. 🟢 **Примеры промптов** — добавить 5+ сценариев
8. 🟢 **Timing метрики** — T_TTFB, T_TTLB

### Уровень уверенности: 95% в архитектуре, 70% в селекторах

---

## Qwen (чат a2cac957)

### Ключевые рекомендации:
1. 🔴 **Фрагильность селекторов** — нужны Multi-tier Locators
2. 🔴 **ArrayBuffer через page.evaluate()** — сериализуется как {}
3. 🟡 **Anti-Bot** — playwright-extra stealth + humanType()
4. 🟡 **State Drift** — pointer-events:none + верификация textarea
5. 🟡 **Context Overflow** — парсинг UI-ошибки → суммаризация → новый чат
6. 🟡 **Resource Leaks** — Connection Pooling + browserContext.close()
7. 🟢 **T_TTFB метрика** — замер времени до первого байта

### Уровень уверенности: 85%

---

## DeepSeek (чат 48a94af5)

### Ключевые рекомендации:
1. 🔴 **Нет health-check** — Startup Health-Check
2. 🔴 **Нет circuit breaker** — при падении селектора
3. 🟡 **Graceful degradation** — fallback при ошибке провайдера
4. 🟡 **Семантическое кэширование** — не отправлять повторно похожие промпты
5. 🟡 **Бесконечная генерация** — авто-прерывание при достижении лимита

### Уровень уверенности: 88%

---

## Итого: реализовано в v13.0 → v13.2

| # | Рекомендация | От кого | Приоритет | Статус |
|---|-------------|---------|-----------|--------|
| 1 | JS → scripts/ | GLM | P0 | ✅ v13.0 |
| 2 | detect+extract → response.js | GLM | P0 | ✅ v13.1 |
| 3 | blob try/finally | GLM | P0 | ✅ v13.1 |
| 4 | multi-provider context fix | GLM | P0 | ✅ v13.1 |
| 5 | Multi-tier locators | Qwen | P0 | ✅ v13.0 |
| 6 | ArrayBuffer→base64 | Qwen | P0 | ✅ v13.1 |
| 7 | healthCheck() | DeepSeek | P0 | ✅ v13.0 (в response.js) |
| 8 | Примеры промптов | GLM | P1 | ✅ v13.2 |
| 9 | console.warn logging | Qwen | P1 | ✅ v13.1 |
| 10 | Agent Mode hang recovery | GLM | P1 | ✅ v11.0 |
| 11 | Anti-Bot stealth | Qwen | P2 | ⏳ |
| 12 | Timing метрики | Qwen+GLM | P2 | ⏳ |
| 13 | Семантическое кэширование | DeepSeek | P2 | ⏳ |
