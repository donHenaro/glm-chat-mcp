# Результаты тестирования продвинутых режимов — 2025-07-15

## 1. GLM (chat.z.ai)

### Режимы
| Режим | Селектор | Статус |
|-------|----------|--------|
| Chat | `button:text("Chat")` | ✅ |
| Agent | `button:text("Agent")` | ✅ data-active=true |
| DeepThink | `button[data-autothink]` | ✅ data-autothink=true |
| Web Search | `button[data-active]` | ✅ data-active=true |
| Model Selector | `.modelSelectorButton` | ✅ |
| File | `input[type="file"]` (hidden) | ✅ setInputFiles работает |
| More | `button[aria-label="More"]` | ✅ открывает меню |

### FILE UPLOAD ✅
- `setInputFiles()` на скрытый `input[type="file"]` работает
- GLM прочитал файл: "speed of light is approximately 299,792,458 meters per second"
- Поддерживаемые форматы: `.pdf,.docx,.doc,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.svg,.csv,.py,.txt,.md,.bmp,.gif,.mp4,.html,.mp3`

### DeepThink ✅
- Ответ содержит "Thought Process" → "The capital of Australia is Canberra."
- Thinking фаза через SSE: `phase:"thinking"`

### Agent Mode ✅
- Ответ: "42" (15+27)
- Placeholder меняется на "Send a Message"

---

## 2. Qwen (chat.qwen.ai)

### Режимы
| Режим | Селектор | Статус |
|-------|----------|--------|
| Thinking | `.qwen-thinking-selector` | ✅ "Автоматический" |
| Model Select | `.index-module__model-selector___rdCim` | ✅ Qwen3.7-Plus |
| Mode Select | `.mode-select` | ✅ |
| Voice Input | `.record-btn` | ✅ |
| File | `input[type="file"]` (hidden) | ✅ setInputFiles работает |
| Search | `.chat-search`, `.search-container` | ✅ |

### FILE UPLOAD ✅
- `setInputFiles()` на скрытый input работает
- Qwen прочитал файл: "standard speed of light is exactly 299,792,458 meters per second"
- File accept = "" (все форматы)

### DeepThink (Automatically enabled) ✅
- "Завершено размышление" (Thinking complete)
- Selector: `.qwen-chat-thinking-tool-status-card-wrap`
- 3 опции: Автоматический, и ещё (через Ant Design Select)

---

## 3. DeepSeek (chat.deepseek.com)

### Режимы
| Режим | Селектор | Статус |
|-------|----------|--------|
| Быстрый режим (Fast) | text содержит "Быстрый режим" | ✅ |
| Глубокое мышление (DeepThink) | text содержит "Глубокое мышление" | ✅ |
| Умный поиск (Smart Search) | text содержит "Умный поиск" | ✅ |
| File | `input[type="file"]` | ✅ |
| Send | `.ds-button--circle.ds-button--primary` | ✅ (кнопка справа от textarea) |

### FILE UPLOAD ✅
- `setInputFiles()` на `input[type="file"]` работает
- DeepSeek прочитал файл: "speed of light is approximately 299,792,458 meters per second"
- **Огромная поддержка форматов**: 200+ расширений (все языки программирования, PDF, изображения, Office)
- После загрузки файла нужно нажать `.ds-button--circle` (кнопку Send), Enter не срабатывает

### DeepThink ✅
- Ответ содержит полную цепочку рассуждений: "25 * 37 = 25 * (30+7) = 750 + 175 = 925"
- `hasThinking: true`

---

## 4. Kimi (www.kimi.com)

### Режимы (Sidebar)
| Режим | Статус |
|-------|--------|
| New Chat | ✅ |
| Slides (презентации) | ✅ |
| Websites (сайты) | ✅ |
| Docs (документы) | ✅ |
| Deep Research | ✅ |
| Sheets (таблицы) | ✅ |
| Agent Swarm (мультиагентный режим!) | ✅ |
| Kimi Code (кодинг) | ✅ |
| Kimi Claw | ✅ |
| Kimi WebBridge | ✅ "Let AI use the browser like a human" |

### FILE UPLOAD ❌
- **Нет `input[type="file"]`** на главной странице
- Файлы загружаются через Docs или `/` слэш-команды
- Нужен другой подход для программной загрузки

### Input
- `contenteditable="true"` с `role="textbox"` — не стандартный textarea

### Ограничения
- Использует gRPC — network hooks не работают
- UI на div-ах без `<button>` — сложно найти кнопки
- Нет file input на главной странице

---

## Общий вывод

| Функция | GLM | Qwen | DeepSeek | Kimi |
|---------|-----|------|----------|------|
| DeepThink | ✅ data-autothink | ✅ qwen-thinking-selector | ✅ "Глубокое мышление" | N/A |
| Agent Mode | ✅ кнопка Agent | ❌ | ❌ | ✅ Agent Swarm |
| Web Search | ✅ data-active | ✅ search-container | ✅ "Умный поиск" | ❌ |
| File Upload | ✅ setInputFiles | ✅ setInputFiles | ✅ setInputFiles | ❌ нет input |
| Send | Enter | Enter | кнопка Send | Enter |
| Network Hooks | ✅ | ✅ | ⚠️ re-override | ❌ gRPC |
