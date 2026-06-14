# GLM Refactoring Plan for glm-chat-mcp

## P0 — Критично, блокирует дальнейшее развитие

### 1. Расщепление provider-adapter.js (700 → ~5 модулей)

**Зачем:** Монолит делает невозможным добавление новых провайдеров без конфликтов, тестирование изолированно и code-review.

**Целевая структура:**
```
scripts/providers/
├── spec.js           — PROVIDERS spec (единственное место)
├── base-adapter.js   — BaseAdapter с transformRequest/transformResponse/extractUsage
├── glm-adapter.js    — GLMAdapter
├── qwen-adapter.js   — QwenAdapter
├── deepseek-adapter.js — DeepSeekAdapter
├── kimi-adapter.js   — KimiAdapter
├── openai-normalizer.js — OpenAINormalizer
└── index.js          — createAdapter(name) фабрика + exports
```

**Ключевые правила:**
- `spec.js` — единственное место, где описана структура PROVIDERS. Все остальные модули импортируют из него.
- Каждый адаптер наследует BaseAdapter и реализует `transformRequest()`, `transformResponse()`, `extractUsage()`.
- Фабрика `createAdapter(name)` в `index.js` заменяет текущий switch/if-каскад.

### 2. Устранение дублирования PROVIDERS spec

**Проблема:** Спецификация провайдеров описана inline в provider-adapter.js и дублируется в multi-provider.js / mode-switcher.js.

**Решение:** `spec.js` — единственный источник истины.

**Правило:** Любой код, которому нужны данные о провайдере, делает `const { getProviderSpec } = require('./spec')`. Прямой доступ к константе — только через spec.js.

## P1 — Важно, обеспечивает качество

### 3. Структурирование scripts/ по доменам

**Текущее:** 12 JS-файлов в плоской папке.

**Целевое:**
```
scripts/
├── providers/        — Адаптеры провайдеров
│   ├── spec.js
│   ├── base-adapter.js
│   ├── glm-adapter.js
│   ├── qwen-adapter.js
│   ├── deepseek-adapter.js
│   ├── kimi-adapter.js
│   ├── openai-normalizer.js
│   └── index.js
├── inference/        — Чтение ответов
│   ├── response.js
│   ├── ai-extract.js
│   └── progress-monitor.js
├── network/          — Перехват трафика
│   ├── network-hooks.js
│   └── cdp-intercept.js
├── orchestration/    — Управление режимами
│   ├── mode-switcher.js
│   └── multi-provider.js
├── session/          — Сессии
│   └── session-manager.js
├── infra/            — Инфраструктура
│   └── debug-trace.js
└── hooks-auto-init.js — Точка входа
```

**Миграция:** За один коммит — перемещение файлов + обновление всех require() путей. Никаких изменений логики в этом коммите.

### 4. Unit-тесты (Jest)

**Приоритет покрытия:**

| Приоритет | Модуль | Что тестировать |
|-----------|--------|----------------|
| 1 | providers/spec.js | Все spec-записи валидны, getProviderSpec возвращает/кидает |
| 2 | providers/*-adapter.js | transformRequest, transformResponse, extractUsage для каждого |
| 3 | providers/openai-normalizer.js | Нормализация разных форматов → единый OpenAI-формат |
| 4 | inference/response.js | Обработка потоковых и обычных ответов |
| 5 | inference/ai-extract.js | Извлечение контента из разных структур ответа |
| 6 | session/session-manager.js | Создание/очистка сессий, TTL |
| 7 | orchestration/mode-switcher.js | Переключение провайдеров по конфигу |

**Минимальная конфигурация:** Jest + babel

**Целевой порог:** после P1 ≥60% coverage, после P2 ≥80%.

### 5. Разделение SKILL.md на meta и config

**Текущее:** Один SKILL.md смешивает описание навыка и конфигурацию.

**Целевое:**
```
SKILL.md              — Мета: описание, capabilities, workflow, triggers
skill.config.json     — Конфигурация: провайдеры, модели, порты, API keys
```

## P2 — Значимое улучшение DX

### 6. Миграция на TypeScript

**Стратегия:** Постепенная (allowJs + gradual), не Big Bang.

| Фаза | Что | Срок |
|------|-----|------|
| 2a | tsconfig.json с `allowJs: true, checkJs: false` + JSDoc type annotations | 1 день |
| 2b | providers/spec.ts + base-adapter.ts — первые .ts файлы | 1 день |
| 2c | Остальные адаптеры → .ts по одному | 2 дня |
| 2d | server/openai-bridge.ts — типизация Express | 1 день |
| 2e | `checkJs: true, noImplicitAny: true` — полный strict | 1 день |

**Ключевые типы:**
```typescript
interface ProviderSpec { host: string; input: {...}; response: {...}; modes: {...} }
interface Adapter { transformRequest(prompt, opts): PromptSpec; transformResponse(raw): NormalizedResponse; extractUsage(raw): Usage; }
interface NormalizedResponse { content: string; reasoning?: string; usage: Usage; }
```

### 7. CI/CD (GitHub Actions)

**Минимальный пайплайн:** lint → test → build

**Дальнейшие этапы (P3):**
- Автопаблиш npm-пакета по тегу
- E2E тесты в CI (test-e2e.js)
- Lint PR-названий + conventional commits

## P3 — Полировка

### 8. Рефакторинг server/openai-bridge.js

Выделить middleware в отдельные модули:
```
server/
├── middleware/
│   ├── auth.js
│   ├── rate-limit.js
│   └── cache.js
├── routes/
│   ├── completions.js
│   ├── models.js
│   └── metrics.js
└── openai-bridge.js  — только wiring
```

### 9. Строгая конфигурация через Zod

### 10. Документация API
- OpenAPI spec для /v1/chat/completions
- JSDoc/TSDoc на всех публичных методах адаптеров
- README с architecture diagram (Mermaid)

## Порядок выполнения

```
P0.1 → P0.2 → P1.3 → P1.4 → P1.5 → P2.6 → P2.7 → P3.8 → P3.9 → P3.10
```

Каждый P0/P1 пункт — отдельный PR с тестами. P2 можно делать инкрементально по файлам. P3 — по возможности.
