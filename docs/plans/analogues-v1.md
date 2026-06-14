================================================================================
АНАЛИЗ АНАЛОГОВ glm-chat-mcp И webchat2api
Играющие Playwright-фичи для развития скилла
Дата: 2026-06-13
================================================================================

СОДЕРЖАНИЕ
1. Введение и методология
2. Аналоги: Web Chat → API конвертеры
3. Playwright Stealth и анти-детекция
4. AI Browser Automation фреймворки
5. Playwright API: недоиспользованные фичи
6. Матрица заимствований
7. Рекомендации по развитию glm-chat-mcp v14.0

================================================================================
1. ВВЕДЕНИЕ И МЕТОДОЛОГИЯ
================================================================================

Цель: найти open-source проекты с функциональностью, аналогичной glm-chat-mcp
(автоматизация бесплатных веб-чатов GLM/Qwen/DeepSeek через Playwright),
и выявить Playwright-плагины и API-фичи, способные улучшить наш скилл.

Критерии поиска:
- Web Chat → API: проекты, превращающие веб-интерфейс LLM-чатов в REST API
- Stealth: инструменты обхода бот-детекции при браузерной автоматизации
- AI Agent: фреймворки для AI-управляемого браузера поверх Playwright
- Playwright API: встроенные возможности, которые мы не используем

Источники: GitHub, npm, HackerNews, Reddit, технические блоги.
Период: 2024–2026.

================================================================================
2. АНАЛОГИ: WEB CHAT → API КОНВЕРТЕРЫ
================================================================================

--------------------------------------------------------------------------------
2.1 Chat2API (xiaoY233/Chat2API)
--------------------------------------------------------------------------------
GitHub: https://github.com/xiaoY233/Chat2API
Звёзды: высокий рейтинг в topics/free-api

Описание: "Chat2API enables zero-cost access to leading AI models by
leveraging official web UIs. It supports providers such as DeepSeek, GLM,
Kimi, MiniMax, Qwen, and Z.ai."

Ключевые фичи:
- Поддержка 6+ провайдеров: DeepSeek, GLM, Kimi, MiniMax, Qwen, Z.ai
- OpenAI-совместимый API-эндпоинт (то есть можно подключать Cline, Roo-Code,
  openclaw и другие инструменты через стандартный /v1/chat/completions)
- SSE-streaming — токены отдаются в реальном времени
- Cookie-based авторизация — использует cookies из браузерной сессии
- Интеграция с Cline, Roo-Code, openclaw из коробки

Архитектура: HTTP-сервер (Python/Go), который управляет браузером через
cookie/token, извлекает ответы из веб-интерфейса и отдаёт их в формате
OpenAI API.

СРАВНЕНИЕ С glm-chat-mcp:
+ Больше провайдеров (6 vs наши GLM+Qwen+DeepSeek)
+ OpenAI-совместимый API — стандарт де-факто, наш скилл работает только
  через MCP Playwright команды
+ SSE streaming из коробки
- Нет Playwright — видимо использует прямые HTTP-запросы к внутренним API
  провайдеров (более хрупкий, но более быстрый подход)
- Нет интерактивного управления браузером (snapshot, click, type)
- Не работает как MCP-скилл для IDE

ЧТО ВЗЯТЬ:
→ Концепция OpenAI-совместимого API-слоя поверх браузера
→ SSE-streaming как обязательная опция
→ Шаблоны интеграции с Cline/Roo-Code

--------------------------------------------------------------------------------
2.2 WebModel / web-model-bridge (linuxhsj/WebModel)
--------------------------------------------------------------------------------
GitHub: https://github.com/linuxhsj/WebModel

Описание: "web-model-bridge is a standalone HTTP service that lets any AI
tool use web-based AI models through their free browser interfaces. It acts
as a bridge..."

Поддерживаемые провайдеры: Claude, ChatGPT, Gemini, DeepSeek, Doubao,
Grok, Qwen, Manus, Kimi — 9 провайдеров!

Ключевые фичи:
- Standalone HTTP-сервис — bridge между AI-инструментами и бесплатными
  веб-интерфейсами моделей
- Поддержка 9 провайдеров (самый широкий набор из найденных)
- OpenAI-совместимый эндпоинт
- "NO API Token" — работает через браузерные куки/сессии
- Модель-агностик: один API для доступа ко всем провайдерам

СРАВНЕНИЕ С glm-chat-mcp:
+ Самый широкий набор провайдеров (9 vs 3)
+ Standalone HTTP-сервис — можно использовать из любого инструмента,
  не только из IDE с MCP
+ Унифицированный API для всех провайдеров
- Вероятно, использует прямые HTTP-вызовы вместо Playwright
- Нет MCP-интеграции
- Нет визуального контроля браузера (snapshot, screenshot)

ЧТО ВЗЯТЬ:
→ Паттерн "унифицированный провайдер-агностик API" — единый интерфейс
  для всех чатов с автоматическим роутингом
→ Концепция standalone HTTP-bridge как альтернативы MCP

--------------------------------------------------------------------------------
2.3 UnBlockAI
--------------------------------------------------------------------------------
GitHub/Medium: https://medium.com/@joshionchain/how-i-built-a-free-chatgpt-api-alternative-using-browser-automation-6f0e190d5dd7

Описание: "UnBlockAI — a tool that transforms your ChatGPT Plus subscription
into a local REST API using browser automation."

Ключевые фичи:
- Превращает ChatGPT Plus подписку в локальный REST API
- Использует browser automation (Playwright/Puppeteer)
- Streaming-ответы
- Локальный сервер, не требует облака

СРАВНЕНИЕ С glm-chat-mcp:
+ Аналогичный подход — browser automation для API
+ Streaming из коробки
- Только ChatGPT — узкий фокус
- Закрытый исходный код (частично)
- Не MCP-скилл

ЧТО ВЗЯТЬ:
→ Подтверждение, что подход browser→API жизнеспособен и востребован

--------------------------------------------------------------------------------
2.4 Simple ChatGPT Proxy (GoPenAI)
--------------------------------------------------------------------------------
URL: https://blog.gopenai.com/simple-chatgpt-proxy-a-tiny-headless-browser-relay-for-chatgpt-a85115e890f6

Описание: "Simple ChatGPT Proxy — a tiny headless browser relay for ChatGPT.
Streams ChatGPT answers into your web page (live, token-by-token). Zero API
key required."

Ключевые фичи:
- Express-сервер → статическая страница + /api/chat
- При запросе запускает Playwright + Chrome (headless/headful)
- Token-by-token streaming
- Минимальная реализация — "tiny relay"

СРАВНЕНИЕ С glm-chat-mcp:
+ Идентичный подход: Express + Playwright + streaming
+ Минималистичная архитектура — хороший референс
- Только ChatGPT
- Нет анти-детекции
- Нет MCP

ЧТО ВЗЯТЬ:
→ Архитектурный паттерн "tiny relay" — минимальный прокси:
  Express → /api/chat → Playwright → ChatGPT → SSE
→ Token-by-token streaming через page.evaluate() + MutationObserver

--------------------------------------------------------------------------------
2.5 headless-chatgpt (HalilCan)
--------------------------------------------------------------------------------
GitHub: https://github.com/HalilCan/headless-chatgpt

Описание: "Headless ChatGPT is a browser-based API emulator for ChatGPT.
It is a local server that controls a puppeteer Chrome instance."

Ключевые фичи:
- Puppeteer (не Playwright) для управления браузером
- Локальный сервер-эмулятор API
- Cookie-based аутентификация

СРАВНЕНИЕ С glm-chat-mcp:
- Устаревший подход (Puppeteer вместо Playwright)
- Только ChatGPT
→ Ничего нового, но подтверждает популярность паттерна

--------------------------------------------------------------------------------
2.6 PawanOsman/ChatGPT (Reverse Proxy)
--------------------------------------------------------------------------------
GitHub: https://github.com/PawanOsman/ChatGPT

Описание: "ChatGPT API Free Reverse Proxy — free self-hosted API access
to ChatGPT (gpt-3.5-turbo) with OpenAI's familiar structure."

Ключевые фичи:
- Не использует браузер — работает как обратный прокси
- OpenAI-совместимый API
- Бесплатный доступ к gpt-3.5-turbo

СРАВНЕНИЕ С glm-chat-mcp:
- Принципиально другая архитектура — reverse proxy, не browser automation
→ Не релевантно для нашего подхода, но подтверждает спрос на OpenAI-формат

================================================================================
3. PLAYWRIGHT STEALTH И АНТИ-ДЕТЕКЦИЯ
================================================================================

--------------------------------------------------------------------------------
3.1 CloakBrowser (CloakHQ/CloakBrowser) ★★★★★ — ВАЖНЕЙШИЙ
--------------------------------------------------------------------------------
GitHub: https://github.com/CloakHQ/cloakBrowser
npm: npm install cloakbrowser
Последнее обновление: 2026-06-10 (активный проект)

Описание: "Stealth Chromium that passes every bot detection test. Drop-in
Playwright/Puppeteer replacement with source-level fingerprint patches.
30/30 tests passed."

Ключевые фичи:
- Кастомная сборка Chromium с патчами НА УРОВНЕ ИСХОДНОГО КОДА
  (не JavaScript-патчи, а патчи самого движка!)
- Drop-in замена Playwright: 3 строки кода для подключения
- Проходит ВСЕ 30 тестов на bot.sannysoft.com, pixelscan.net и т.д.
- Обходит Cloudflare, reCAPTCHA
- Поддерживает и Playwright, и Puppeteer
- Open source, бесплатный

Пример подключения:
```js
import { chromium } from 'cloakbrowser';
// Всё! Остальной код Playwright без изменений
const browser = await chromium.launch({ headless: false });
```

Патчи на уровне бинарника:
- navigator.webdriver → false (патч в C++ коде Chromium)
- Runtime.enable fingerprint → скрыт
- CDP detection → скрыт
- Canvas fingerprint → рандомизирован
- WebGL renderer → подменён
- User-Agent → консистентный с fingerprint

ПОЧЕМУ ЭТО ВАЖНО ДЛЯ glm-chat-mcp:
Сейчас наши чаты (GLM, Qwen, DeepSeek) могут в любой момент добавить
бот-детекцию. CloakBrowser даёт защиту НА УРОВНЕ ДВИЖКА — это на порядок
надёжнее, чем JavaScript-патчи в playwright-extra-stealth.

ПРИОРИТЕТ: P0 — внедрить как опцию (fallback на обычный Playwright если
CloakBrowser не установлен)

--------------------------------------------------------------------------------
3.2 playwright-extra + puppeteer-extra-plugin-stealth
--------------------------------------------------------------------------------
npm: playwright-extra (v4.3.6)
GitHub: berstend/puppeteer-extra (ecosystem)

Описание: "playwright-extra is a drop-in replacement for playwright, it
augments the installed playwright with plugin functionality."

Ключевые фичи:
- Drop-in замена: const { chromium } = require('playwright-extra')
- Плагинная архитектура: chromium.use(stealth)
- Совместимость с puppeteer-extra-plugin-stealth (порт на Playwright)
- Stealth-плагин применяет набор JavaScript-патчей:
  * navigator.webdriver → undefined
  * Chrome Runtime патчи
  * iframe contentWindow патчи
  * media codecs патчи
  * navigator.languages патчи
  * WebGL vendor/renderer патчи
  * и ещё ~10 патчей

Пример:
```js
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const browser = await chromium.launch({ headless: true });
```

ОГРАНИЧЕНИЯ:
- JavaScript-патчи можно обнаружить продвинутой бот-детекцией
- Не обновлялся 3 года (v4.3.6 published 3 years ago)
- Playwright с версии 1.40+ улучшил встроенный stealth
- Некоторые патчи конфликтуют с новыми версиями Playwright

ПРИОРИТЕТ: P1 — как дополнение к CloakBrowser или как lightweight-опция
если CloakBrowser недоступен

--------------------------------------------------------------------------------
3.3 managedcode/playwright_stealth (C#)
--------------------------------------------------------------------------------
GitHub: https://github.com/managedcode/playwright_stealth

Описание: "Stealth evasion library for Playwright — applies a curated set
of init scripts to Microsoft.Playwright contexts."

- C#/.NET реализация (не релевантно для нашего JS/TS стека)
→ Не подходит, но интересно как подтверждение, что stealth — массовая
  потребность

--------------------------------------------------------------------------------
3.4 Сравнение подходов к Stealth
--------------------------------------------------------------------------------
+---------------------+----------------+------------------+-----------------+
| Подход              | Уровень        | Надёжность       | Для нас         |
+---------------------+----------------+------------------+-----------------+
| Без stealth         | —              | Низкая           | Сейчас          |
| playwright-extra    | JS-патчи       | Средняя          | P1 опция        |
| + stealth plugin    |                |                  |                 |
| CloakBrowser        | C++ бинарник   | Очень высокая    | P0 приоритет    |
| Browserless.io      | Облачный       | Высокая          | Не подходит     |
| Bright Data         | Проксирующий   | Высокая          | Платный         |
+---------------------+----------------+------------------+-----------------+

================================================================================
4. AI BROWSER AUTOMATION ФРЕЙМВОРКИ
================================================================================

--------------------------------------------------------------------------------
4.1 Stagehand (browserbase/stagehand) ★★★★
--------------------------------------------------------------------------------
GitHub: https://github.com/browserbase/stagehand
Документация: https://stagehand.dev

Описание: "The SDK for browser agents. Stagehand is an open source SDK
that uses AI to make your browser agents resilient, readable, and
production-ready."

Ключевые примитивы:
1. act(instruction) — выполнить действие по описанию
   Пример: page.act("click the submit button")
2. extract(instruction) — извлечь данные
   Пример: page.extract("get the price of the item")
3. observe() — пронаблюдать текущее состояние страницы
4. agent() — автономный AI-агент для сложных задач

Архитектура:
- Построен поверх Playwright (использует его как движок)
- AI-модели используются для интерпретации DOM и принятия решений
- Resilient: если селектор ломается, AI находит альтернативу

ПРИМЕНИМОСТЬ ДЛЯ glm-chat-mcp:
→ observe() — можно использовать для автоматического определения состояния
  чата (загружен? есть ошибка? идёт стриминг?) вместо хрупких селекторов
→ extract() — надёжное извлечение текста ответа без привязки к конкретным
  CSS-селекторам — РЕШЕНИЕ ПРОБЛЕМЫ СЛОМАННЫХ СЕЛЕКТОРОВ
→ act() — вместо browser_click + browser_type с конкретными селекторами

ЧТО ВЗЯТЬ:
→ Концепцию AI-powered extract() вместо хрупких STRATEGIES-селекторов
→ observe() для автодетекции состояния страницы
→ Но: зависимость от AI-модели добавляет стоимость и задержку →
  использовать как fallback, не как основной путь

--------------------------------------------------------------------------------
4.2 browser-use (browser-use/browser-use)
--------------------------------------------------------------------------------
GitHub: https://github.com/browser-use/browser-use

Описание: "Make websites accessible for AI agents. Browser Use 0.13
introduces a new beta agent powered by a Rust core and a browser harness
built for current frontier models."

Ключевые фичи:
- Rust-ядро для скорости
- Python API
- Поддержка множества LLM как "мозг" агента
- Автономное выполнение задач

ПРИМЕНИМОСТЬ ДЛЯ glm-chat-mcp:
- Python/Rust — другая экосистема, но концепции полезны
→ Rust-ядро для обработки ответов — идея для будущей оптимизации

--------------------------------------------------------------------------------
4.3 Steel.dev (steel-dev/steel-browser)
--------------------------------------------------------------------------------
GitHub: https://github.com/steel-dev/steel-browser
Сайт: https://steel.dev

Описание: "Open Source Browser API for AI Agents. Spin up on-demand
browser sessions with a simple API call."

Ключевые фичи:
- Управление сессиями браузера через API
- Fleet of browsers — масштабирование
- Совместим с Playwright, Puppeteer, Selenium
- Session persistence — сохранение состояния между запросами

ПРИМЕНИМОСТЬ ДЛЯ glm-chat-mcp:
→ Session persistence — критически важно для multi-turn диалогов!
  Сейчас наш скилл теряет контекст при перезапуске
→ Fleet management — для параллельных консультаций (сценарий из нашего
  списка: "код-ревью + анализ PDF параллельно")
→ Но: это облачный сервис, нужен self-hosted вариант

ЧТО ВЗЯТЬ:
→ Концепцию session persistence (сохранение storageState + cookies)
→ API для управления жизненным циклом сессий

--------------------------------------------------------------------------------
4.4 Microsoft playwright-mcp
--------------------------------------------------------------------------------
GitHub: https://github.com/microsoft/playwright-mcp
Документация: https://playwright.dev/docs/getting-started-mcp

Описание: Официальный MCP-сервер от Microsoft для Playwright.
Предоставляет browser automation через Model Context Protocol.

Ключевые инструменты:
- browser_navigate, browser_click, browser_type
- browser_snapshot — accessibility snapshot
- browser_take_screenshot
- browser_evaluate — JS в контексте страницы

СРАВНЕНИЕ С нашим подходом:
Мы УЖЕ используем этот MCP-сервер. Но есть недоиспользованные возможности:
→ browser_snapshot можно использовать для AI-анализа состояния страницы
  вместо/вместе с CSS-селекторами
→ browser_evaluate — для инъекции нашего JS-кода (response.js, blob-download.js)

================================================================================
5. PLAYWRIGHT API: НЕДОИСПОЛЬЗОВАННЫЕ ФИЧИ
================================================================================

--------------------------------------------------------------------------------
5.1 page.route() — Перехват и модификация сетевых запросов ★★★★★
--------------------------------------------------------------------------------
Документация: https://playwright.dev/docs/api/class-page#page-route

Что делает: Перехватывает HTTP-запросы и ответы на уровне браузера.
Позволяет модифицировать запросы, блокировать ресурсы, инспектировать
ответы.

КАК ПРИМЕНИТЬ В glm-chat-mcp:

А) Перехват SSE-стриминга ответов:
```js
// Вместо опроса DOM через MutationObserver — прямой перехват!
await page.route('**/api/chat/**', async route => {
  const response = await route.fetch();
  const body = await response.text();
  // Парсим SSE-события напрямую из HTTP-ответа
  // data: {"choices":[{"delta":{"content":"Привет"}}]}
  onToken(body);
  await route.fulfill({ response });
});
```

Б) Блокировка ненужных ресурсов (ускорение):
```js
await page.route('**/*.{png,jpg,gif,svg,woff,woff2}', route => route.abort());
await page.route('**/analytics/**', route => route.abort());
await page.route('**/tracking/**', route => route.abort());
```

В) Модификация запросов (добавление заголовков):
```js
await page.route('**/api/**', async route => {
  const headers = { ...route.request().headers(), 'X-Custom': 'value' };
  await route.continue({ headers });
});
```

ВЫГОДА:
- Захват ответа НА УРОВНЕ СЕТИ — не зависит от DOM-селекторов
- Это РЕШАЕТ проблему хрупких STRATEGIES-селекторов для response.js
- Блокировка ресурсов ускоряет загрузку страниц на 30-50%
- Можно логировать все запросы для отладки

ПРИОРИТЕТ: P0 — это главная фича, которую мы упускаем

--------------------------------------------------------------------------------
5.2 page.waitForResponse() — Ожидание конкретного HTTP-ответа ★★★★
--------------------------------------------------------------------------------
Документация: https://playwright.dev/docs/api/class-page#page-wait-for-response

Что делает: Ждёт HTTP-ответ, соответствующий условию.

КАК ПРИМЕНИТЬ:
```js
// Ждём ответ от API чата вместо waitForSelector
const [response] = await Promise.all([
  page.waitForResponse(resp => resp.url().includes('/api/chat/') && resp.status() === 200),
  page.click('[data-testid="send-button"]'),
]);
const body = await response.text();
// Парсим SSE
```

ВЫГОДА:
- Замена setTimeout-поллинга на детерминированное ожидание
- Не зависит от DOM — работает даже если UI изменился
- Идеально для стриминга: waitForResponse + чтение chunks

ПРИОРИТЕТ: P0 — в паре с page.route()

--------------------------------------------------------------------------------
5.3 page.exposeFunction() — Мост browser↔Node.js ★★★★
--------------------------------------------------------------------------------
Документация: https://playwright.dev/docs/api/class-page#page-expose-function

Что делает: Экспортирует Node.js функцию в контекст браузера.
Браузерный JS может вызывать Node.js функции напрямую.

КАК ПРИМЕНИТЬ:
```js
// Экспортируем функцию логирования
await page.exposeFunction('logToNode', (msg) => {
  console.log('[BROWSER]', msg);
});

// Экспортируем функцию стриминга
await page.exposeFunction('onToken', (token) => {
  streamCallback(token);
});

// В инъецированном скрипте:
// window.onToken(data.choices[0].delta.content);
```

ВЫГОДА:
- Убирает необходимость в poll-механизмах для передачи данных из браузера
  в Node.js
- Прямой вызов вместо setTimeout(() => page.evaluate(...), 1000)
- Идеально для streaming: браузер вызывает onToken() при каждом токене

ПРИОРИТЕТ: P0 — кардинально упрощает архитектуру response.js

--------------------------------------------------------------------------------
5.4 page.addInitScript() — Инъекция до загрузки страницы ★★★
--------------------------------------------------------------------------------
Документация: https://playwright.dev/docs/api/class-page#page-add-init-script

Что делает: Выполняет JS-код ДО загрузки любой страницы в контексте.
Гарантированно выполняется до любых скриптов сайта.

КАК ПРИМЕНИТЬ:
```js
// Инъекция наших хуков ДО загрузки чата
await page.addInitScript(() => {
  // Перехват fetch для захвата SSE-ответов
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    if (args[0]?.toString().includes('/api/chat')) {
      // Клонируем и обрабатываем стрим
      const [stream1, stream2] = response.body.tee();
      // stream2 → наш парсер
      window.onToken?.(stream2);
      return new Response(stream1, response);
    }
    return response;
  };

  // Перехват EventSource для SSE
  const OrigES = window.EventSource;
  window.EventSource = function(url, opts) {
    const es = new OrigES(url, opts);
    if (url.includes('/api/')) {
      es.addEventListener('message', (e) => {
        window.onSSEMessage?.(e.data);
      });
    }
    return es;
  };
});
```

ВЫГОДА:
- Наши хуки работают ДО загрузки сайта — ничего не пропускаем
- fetch/EventSource перехват → гарантированный захват стриминга
- Не зависит от DOM-структуры конкретного провайдера

ПРИОРИТЕТ: P1 — мощное дополнение к page.route()

--------------------------------------------------------------------------------
5.5 CDPSession — Низкоуровневый доступ к Chrome DevTools Protocol ★★★
--------------------------------------------------------------------------------
Документация: https://playwright.dev/docs/api/class-cdpsession

Что делает: Прямой доступ к CDP — можно перехватывать сетевой трафик
на самом низком уровне, управлять кэшем, эмулировать условия сети.

КАК ПРИМЕНИТЬ:
```js
const cdp = await page.context().newCDPSession(page);

// Включаем перехват сетевых событий
await cdp.send('Network.enable');

// Слушаем ВСЕ сетевые события
cdp.on('Network.responseReceived', (params) => {
  if (params.response.url.includes('/api/chat')) {
    console.log('Chat API response:', params.response.status);
  }
});

// Эмуляция медленной сети для тестирования
await cdp.send('Network.emulateNetworkConditions', {
  offline: false, latency: 100, downloadThroughput: 50000,
  uploadThroughput: 50000
});
```

ВЫГОДА:
- Самый надёжный способ перехвата сетевого трафика
- Доступ к данным, которые page.route() не видит (WebSocket frames)
- Эмуляция сетевых условий для тестирования

ПРИОРИТЕТ: P2 — продвинутая опция, нужна только если page.route()
недостаточно

--------------------------------------------------------------------------------
5.6 storageState() — Сохранение/восстановление сессии ★★★★
--------------------------------------------------------------------------------
Документация: https://playwright.dev/docs/api/class-browsercontext#browser-context-storage-state

Что делает: Сохраняет и восстанавливает cookies + localStorage.

КАК ПРИМЕНИТЬ:
```js
// Сохранение сессии после логина
await context.storageState({ path: 'auth/glm-session.json' });

// Восстановление при следующем запуске
const context = await browser.newContext({
  storageState: 'auth/glm-session.json'
});
```

ВЫГОДА:
- Не нужно повторно проходить логин/капчу при каждом запуске
- Persistent sessions для multi-turn диалогов
- Можно иметь несколько сохранённых сессий для разных провайдеров

ПРИОРИТЕТ: P0 — критически важно для UX

--------------------------------------------------------------------------------
5.7 Tracing API — Запись и воспроизведение сессий ★★★
--------------------------------------------------------------------------------
Документация: https://playwright.dev/docs/api/class-tracing

Что делает: Записывает все действия, сетевые запросы, скриншоты в
trace-файл. Можно воспроизвести в Playwright Trace Viewer.

КАК ПРИМЕНИТЬ:
```js
// Включаем трейсинг перед действием
await context.tracing.start({ screenshots: true, snapshots: true });

// ... выполнение сценария ...

// Сохраняем трейс
await context.tracing.stop({ path: 'traces/glm-chat-failure.zip' });
```

ВЫГОДА:
- Идеально для отладки: видим ВСЮ хронологию — клики, сетевые запросы,
  DOM-состояния
- Можно прикреплять trace-файлы к баг-репортам
- Trace Viewer — мощный инструмент анализа

ПРИОРИТЕТ: P1 — для отладки и диагностики проблем

--------------------------------------------------------------------------------
5.8 Сводка недоиспользованных Playwright-фич
--------------------------------------------------------------------------------
+---------------------+----------+------------------------------------------+
| Фича                | Приоритет| Влияние на glm-chat-mcp                  |
+---------------------+----------+------------------------------------------+
| page.route()        | P0       | Захват стриминга без DOM-селекторов      |
| waitForResponse()   | P0       | Детерминированное ожидание ответа        |
| exposeFunction()    | P0       | Прямой мост browser→Node для токенов     |
| storageState()      | P0       | Persistent sessions, нет повторного      |
|                     |          | логина                                   |
| addInitScript()     | P1       | Ранний перехват fetch/EventSource        |
| Tracing API         | P1       | Отладка и диагностика                    |
| CDPSession          | P2       | Низкоуровневый перехват + WebSocket      |
+---------------------+----------+------------------------------------------+

================================================================================
6. МАТРИЦА ЗАИМСТВОВАНИЙ
================================================================================

+-------------------+---------------------------+-------+-----------+---------------------------+
| Проект/Фича       | Что взять                 | Приор.| Сложность | Куда внедрить в скилл     |
+-------------------+---------------------------+-------+-----------+---------------------------+
| Chat2API          | OpenAI-совместимый API    | P1    | Средняя   | Новый модуль:             |
|                   | формат /v1/chat/          |       |           | openai-adapter.js         |
|                   | completions               |       |           |                           |
+-------------------+---------------------------+-------+-----------+---------------------------+
| Chat2API          | SSE-streaming ответ       | P0    | Низкая    | response.js →             |
|                   |                           |       |           | streamViaNetwork()        |
+-------------------+---------------------------+-------+-----------+---------------------------+
| WebModel          | Унифицированный           | P1    | Средняя   | multi-provider.js →       |
|                   | провайдер-агностик API    |       |           | ProviderRouter            |
+-------------------+---------------------------+-------+-----------+---------------------------+
| WebModel          | HTTP-bridge как           | P2    | Высокая   | Новый модуль:             |
|                   | альтернатива MCP          |       |           | http-bridge.js            |
+-------------------+---------------------------+-------+-----------+---------------------------+
| CloakBrowser      | Stealth Chromium          | P0    | Низкая    | browser-launch.js →       |
|                   | drop-in замена            |       |           | detectCloak() fallback    |
+-------------------+---------------------------+-------+-----------+---------------------------+
| playwright-extra  | JS-level stealth          | P1    | Низкая    | browser-launch.js →       |
| + stealth         | патчи                     |       |           | addStealthPlugins()       |
+-------------------+---------------------------+-------+-----------+---------------------------+
| Stagehand         | AI-powered extract()      | P1    | Средняя   | response.js →             |
|                   |                           |       |           | aiExtract() fallback      |
+-------------------+---------------------------+-------+-----------+---------------------------+
| Stagehand         | observe() для детекции    | P1    | Низкая    | Новый модуль:             |
|                   | состояния                 |       |           | page-state.js             |
+-------------------+---------------------------+-------+-----------+---------------------------+
| Steel.dev         | Session persistence       | P0    | Низкая    | session-manager.js →      |
|                   |                           |       |           | storageState()            |
+-------------------+---------------------------+-------+-----------+---------------------------+
| page.route()      | Перехват HTTP-ответов     | P0    | Низкая    | response.js →             |
|                   |                           |       |           | interceptNetwork()        |
+-------------------+---------------------------+-------+-----------+---------------------------+
| waitForResponse() | Детерминированное         | P0    | Низкая    | response.js →             |
|                   | ожидание                  |       |           | waitForChatAPI()          |
+-------------------+---------------------------+-------+-----------+---------------------------+
| exposeFunction()  | Мост browser→Node         | P0    | Низкая    | response.js →             |
|                   |                           |       |           | exposeCallbacks()         |
+-------------------+---------------------------+-------+-----------+---------------------------+
| storageState()    | Persistent sessions       | P0    | Низкая    | session-manager.js        |
+-------------------+---------------------------+-------+-----------+---------------------------+
| addInitScript()   | Ранний перехват           | P1    | Низкая    | Новый модуль:             |
|                   | fetch/EventSource         |       |           | network-hooks.js          |
+-------------------+---------------------------+-------+-----------+---------------------------+
| Tracing API       | Отладка трейсов           | P1    | Низкая    | debug-trace.js            |
+-------------------+---------------------------+-------+-----------+---------------------------+
| CDPSession        | Низкоуровневый перехват   | P2    | Средняя   | cdp-intercept.js          |
+-------------------+---------------------------+-------+-----------+---------------------------+

================================================================================
7. РЕКОМЕНДАЦИИ ПО РАЗВИТИЮ glm-chat-mcp v14.0
================================================================================

--------------------------------------------------------------------------------
P0 — ОБЯЗАТЕЛЬНО (базовая функциональность и надёжность)
--------------------------------------------------------------------------------

1. СЕТЕВОЙ ПЕРЕХВАТ ОТВЕТОВ (page.route() + waitForResponse())
   Проблема: сейчас response.js опирается на DOM-селекторы — хрупко,
   ломается при обновлении UI провайдеров.
   Решение: перехватывать HTTP-ответы на уровне сети через page.route()
   и waitForResponse(). SSE-события парсить напрямую из HTTP-ответа,
   а не из DOM.
   Файл: response.js → interceptNetwork() + parseSSE()
   Время: 1 день

2. МОСТ browser→Node (exposeFunction())
   Проблема: данные из браузера в Node.js передаются через poll
   (page.evaluate с интервалом).
   Решение: экспортировать Node.js колбэки через exposeFunction(),
   чтобы инъецированный JS вызывал их напрямую.
   Файл: response.js → exposeCallbacks()
   Время: 0.5 дня

3. PERSISTENT SESSIONS (storageState())
   Проблема: каждый запуск требует повторного логина/навигации.
   Решение: сохранять storageState после логина, восстанавливать при
   следующем запуске. Отдельные файлы для каждого провайдера.
   Файл: новый session-manager.js
   Время: 0.5 дня

4. CLOAKBROWSER ПОДДЕРЖКА
   Проблема: провайдеры могут добавить бот-детекцию.
   Решение: автовыбор CloakBrowser если установлен, fallback на
   обычный Playwright. 3 строки кода.
   Файл: browser-launch.js → detectCloak()
   Время: 0.5 дня

5. SSE-STREAMING ИЗ КОРОБКИ
   Проблема: сейчас стриминг эмулируется через DOM-polling.
   Решение: настоящий SSE-streaming через page.route() — токены
   передаются клиенту по мере поступления от провайдера.
   Файл: response.js → streamViaNetwork()
   Время: 1 день

ИТОГО P0: ~3.5 дня

--------------------------------------------------------------------------------
P1 — РЕКОМЕНДОВАНО (качество и расширяемость)
--------------------------------------------------------------------------------

6. AI-POWERED EXTRACT (по мотивам Stagehand)
   Проблема: сломанные селекторы при обновлении UI.
   Решение: если network-intercept не сработал (провайдер использует
   WebSocket или шифрование), использовать LLM для извлечения текста
   ответа из snapshot/screenshot.
   Файл: response.js → aiExtract() fallback
   Время: 1 день

7. УНИФИЦИРОВАННЫЙ ПРОВАЙДЕР-АПИ (по мотивам WebModel)
   Проблема: каждый провайдер — свой набор селекторов и логики.
   Решение: ProviderRouter с единым интерфейсом {navigate, send,
   waitForResponse, extract}, где каждый провайдер реализует адаптер.
   Файл: multi-provider.js → ProviderRouter + ProviderAdapter
   Время: 1.5 дня

8. ADDINITSCRIPT ХУКИ (ранний перехват fetch/EventSource)
   Дополнение к page.route(): инъекция перехватчиков fetch/ES
   ДО загрузки страницы. Двойная страховка.
   Файл: новый network-hooks.js
   Время: 0.5 дня

9. TRACING ДЛЯ ОТЛАДКИ
   Проблема: сложно диагностировать ошибки в продакшене.
   Решение: автоматический trace при ошибках, сохранение в файл,
   просмотр через Playwright Trace Viewer.
   Файл: новый debug-trace.js
   Время: 0.5 дня

10. PLAYWRIGHT-EXTRA STEALTH КАК ОПЦИЯ
    Дополнение к CloakBrowser: если CloakBrowser не установлен,
    подключаем playwright-extra + stealth plugin.
    Файл: browser-launch.js → addStealthPlugins()
    Время: 0.5 дня

ИТОГО P1: ~4 дня

--------------------------------------------------------------------------------
P2 — ОПЦИОНАЛЬНО (перспективные возможности)
--------------------------------------------------------------------------------

11. OPENAI-СОВМЕСТИМЫЙ API-СЛОЙ (по мотивам Chat2API)
    HTTP-сервер, предоставляющий /v1/chat/completions, который
    работает через наш скилл. Позволяет подключать Cline, Roo-Code
    и другие инструменты.
    Время: 3 дня

12. CDP-ПЕРЕХВАТ (для WebSocket-ответов)
    Низкоуровневый перехват через Chrome DevTools Protocol.
    Нужен только если провайдеры перейдут на WebSocket.
    Время: 1 день

13. HTTP-BRIDGE (по мотивам WebModel)
    Standalone HTTP-сервис как альтернатива MCP. Позволяет
    использовать скилл не только из IDE.
    Время: 3 дня

ИТОГО P2: ~7 дней

================================================================================
ИТОГОВАЯ СВОДКА
================================================================================

НАИБОЛЕЕ ВЛИЯТЕЛЬНЫЕ НАХОДКИ:

1. ★★★★★ page.route() + waitForResponse() — перехват ответов на уровне
   сети вместо DOM-селекторов. Это КАРДИНАЛЬНО меняет архитектуру
   response.js: от хрупкого DOM-polling к надёжному network-intercept.
   Вдохновлено: Simple ChatGPT Proxy + собственный анализ Playwright API.

2. ★★★★★ CloakBrowser — stealth на уровне Chromium-бинарника.
   30/30 тестов, drop-in замена, 3 строки кода. Это страховка от
   будущей бот-детекции провайдеров.

3. ★★★★☆ exposeFunction() — прямой мост browser→Node.js. Убирает
   необходимость в poll-механизмах, кардинально упрощает streaming.

4. ★★★★☆ storageState() — persistent sessions. Критично для UX:
   без повторного логина, multi-turn диалоги.

5. ★★★☆☆ Chat2API/WebModel — доказательство востребованности подхода
   + концепция OpenAI-совместимого API-слоя как будущее развитие.

6. ★★★☆☆ Stagehand extract() — AI-powered fallback для извлечения
   текста, когда network-intercept не сработал.

ПРИОРИТЕТ РЕАЛИЗАЦИИ:
P0 (3.5 дня) → P1 (4 дня) → P2 (7 дней)
Итого полный roadmap: ~14.5 дней

================================================================================
КОНЕЦ ОТЧЁТА
================================================================================
