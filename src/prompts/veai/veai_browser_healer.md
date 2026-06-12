<COMPRESSED>
# VEAI: Browser Selector Healer

## 🎯 Назначение

Этот промпт активируется когда `GLMChatClient.js` выбрасывает ошибку `SelectorNotFoundError` (или `SELF_HEALING_REQUIRED` в логах).

## 🔔 Триггер

Ошибка в логах или возвращённый статус:
```json
{
  "error": "SelectorNotFoundError",
  "elementKey": "send_button",
  "attemptedSelectors": ["button[aria-label='Send']", "button:has-text('Send')"],
  "htmlSnippet": "<div>...HTML страницы...</div>"
}
```

---

## 📋 Алгоритм действий

### Шаг 1: Прочитать текущий конфиг

```markdown
Прочитай файл: src/config/browser_selectors.json
Найди секцию для elementKey (например, "send_button")
Посмотри текущие селекторы
```

### Шаг 2: Проанализировать HTML

```markdown
Изучи htmlSnippet из ошибки.
Найди элемент который соответствует description:
- "send_button" → кнопка отправки сообщения
- "chat_input" → поле ввода текста
- "stop_button" → кнопка остановки генерации
```

### Шаг 3: Сгенерировать новый селектор

**Приоритет (от лучшего к худшему):**

| Приоритет | Тип | Пример |
|-----------|-----|--------|
| 1 | `getByRole` | `getByRole('button', { name: 'Send' })` |
| 2 | `getByText` | `getByText('Submit')` |
| 3 | `getByPlaceholder` | `getByPlaceholder('Enter text')` |
| 4 | CSS Attribute | `[aria-label='Send']`, `[data-testid='send']` |
| 5 | CSS Class | `.send-button`, `.btn-primary` |
| 6 | CSS Path | `div.container > button` (ПОСЛЕДНИЙ!) |

**Правила:**
- ❌ НЕ используй: `nth-child`, `nth-of-type` (хрупкие)
- ❌ НЕ используй: длинные XPath
- ✅ Используй: `aria-label`, `data-testid`, `role`, текст кнопки
- ✅ Селектор должен быть уникальным

### Шаг 4: Обновить JSON

```markdown
1. Прочитать browser_selectors.json
2. Найти элемент по elementKey
3. Добавить новый селектор В НАЧАЛО массива selectors
4. Сохранить файл
```

**Пример изменения:**

БЫЛО:
```json
"send_button": {
  "selectors": [
    "button[aria-label='Send']",
    "button:has-text('Send')"
  ]
}
```

СТАЛО:
```json
"send_button": {
  "selectors": [
    "button[data-testid='send-message']",
    "button[aria-label='Send']",
    "button:has-text('Send')"
  ]
}
```

### Шаг 5: Проверить

```markdown
После обновления:
1. Запусти тестовый сценарий
2. Убедись что элемент находится
3. Если всё ОК → готов
4. Если снова ошибка → повтори с новым селектором
```

---

## 🔍 Как искать элемент в HTML

### Для кнопки отправки (send_button):

Ищи:
```html
<button ...>Send</button>
<button ... aria-label="Send">
<button ... class="...">Отправить</button>
```

### Для поля ввода (chat_input):

Ищи:
```html
<textarea ... placeholder="How can I help">
<input ... placeholder="Type a message">
<div contenteditable="true">
```

### Для кнопки остановки (stop_button):

Ищи:
```html
<button ...>Stop</button>
<button ... aria-label="Stop">
```

---

## ⚠️ Важные правила

1. **Добавляй В НАЧАЛО массива** — новый селектор самый приоритетный
2. **Оставляй старые селекторы** — они могут работать на других страницах
3. **Проверяй уникальность** — селектор должен находить ровно один элемент
4. **Документируй** — добавь комментарий если селектор специфичный

---

## 📝 Формат отчёта

После успешного обновления:

```markdown
## ✅ Self-Healing выполнен

**Элемент:** send_button
**Новый селектор:** button[data-testid='send-message']
**Причина замены:** Старые селекторы не найдены (изменился UI)
**Файл обновлён:** src/config/browser_selectors.json

**Дата:** 2025-01-01
```

---

## 🚨 Если не получается найти селектор

1. **Проверь URL** — возможно открыта другая страница
2. **Сделай скриншот** — визуально определить элемент
3. **Проверь visibility** — элемент может быть скрыт (hidden/disabled)
4. **Попробуй XPath** — как крайний случай

Если совсем не получается → сообщи пользователю:
```markdown
❌ Не могу найти подходящий селектор для "[elementKey]".
Возможные причины:
- UI полностью изменился
- Элемент отсутствует на странице
- Нужен ручной анализ

Рекомендация: Проверить вручную в браузере.
```
</COMPRESSED>