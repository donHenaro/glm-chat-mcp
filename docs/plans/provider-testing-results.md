# Результаты тестирования провайдеров — 2025-07-15

## Методология
1. Навигация на сайт → авторизация
2. Инъекция скриптов через `page.addScriptTag()`
3. Отправка: `adapter.send('Say only the word YES')` / `adapter.send('List 3 advantages of Python, be concise')`
4. Ожидание 10-15 сек
5. Чтение: `adapter.read()` — приоритет adapter → network → DOM

## Тест 1: Короткий ответ ("YES")

| Провайдер | Send | Network (SSE) | DOM | Answer | Source |
|-----------|------|---------------|-----|--------|--------|
| **GLM** | ✅ textarea | ✅ 18 tokens | ✅ | YES | adapter |
| **Qwen** | ✅ textarea | ✅ | ✅ | YES | network |
| **DeepSeek** | ✅ textarea | ✅ 1 entry | ✅ | Single Word Response | network |
| **Kimi** | ✅ contenteditable | ⚠️ gRPC | ✅ | YES | dom |

## Тест 2: Длинный ответ ("3 преимущества Python")

| Провайдер | Answer (первые 100 символов) | Source |
|-----------|------------------------------|--------|
| **GLM** | "Readable Syntax: Simple, English-like code..." | DOM |
| **Qwen** | "Readability: Clean, English-like syntax makes..." | DOM |
| **DeepSeek** | "Readable and simple syntax – Reduces..." | DOM |
| **Kimi** | "Readable syntax – Clean, English-like code..." | DOM |

## Ключевые находки

### API Endpoints (реальные)
| Провайдер | Endpoint | Протокол |
|-----------|----------|----------|
| GLM | `/api/v2/chat/completions` | REST + SSE |
| Qwen | `/api/v2/chat/completions` | REST + SSE (OpenAI-совместимый) |
| DeepSeek | `/api/v0/chat/completion` | REST + SSE + PoW |
| Kimi | `/apiv2/kimi.chat.v1.ChatService/*` | gRPC-web |

### SSE Форматы
| Провайдер | Формат | Thinking |
|-----------|--------|----------|
| GLM | `{type:"chat:completion", data:{delta_content, phase}}` | `phase:"thinking"` |
| Qwen | OpenAI-совместимый: `choices[0].delta.content` | Нет (в этом тесте) |
| DeepSeek | OpenAI-совместимый + PoW challenge | `reasoning_content` |
| Kimi | gRPC (не SSE) | Не перехватывается |

### Network Hooks
| Провайдер | fetch override | body.tee() | auto-parse | Результат |
|-----------|---------------|-----------|------------|-----------|
| GLM | ✅ | ✅ | ✅ | 18-492 tokens |
| Qwen | ✅ | ✅ | ✅ | 1-30 tokens |
| DeepSeek | ⚠️ SPA кэширует fetch | ✅ после переопределения | ✅ | 1 entry |
| Kimi | ❌ gRPC, не REST | N/A | N/A | DOM only |

### Input Types
| Провайдер | Тип | Селектор |
|-----------|-----|----------|
| GLM | textarea | `#chat-input` |
| Qwen | textarea | `textarea.message-input-textarea` |
| DeepSeek | textarea | `textarea` |
| Kimi | contenteditable | `.chat-input-editor[role="textbox"]` |

### Известные ограничения
1. **Kimi**: gRPC → network hooks не работают, только DOM fallback
2. **DeepSeek**: SPA кэширует fetch → hooks нужно ставить ПОСЛЕ загрузки SPA
3. **Qwen**: после отправки навигирует → нужно реинжектировать скрипты
4. **GLM**: beforeunload диалог блокирует Playwright

### Навигация и реинъекция
Проблема: `page.addScriptTag()` работает только на текущей странице. При навигации (GLM, Qwen) скрипты теряются.

Решения:
1. `page.addInitScript()` — инжектирует на КАЖДУЮ навигацию (Playwright API)
2. CDP `Page.addScriptToEvaluateOnNewDocument` — через CDP сессию

Рекомендация: использовать `addInitScript` вместо `addScriptTag` для production.
