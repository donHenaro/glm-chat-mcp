/**
 * scripts/network-hooks.js v14.0
 * Network interception через JS injection — перехват fetch/EventSource
 * на уровне страницы для захвата SSE-ответов провайдеров.
 *
 * ПРОБЛЕМА: response.js опирается на DOM-селекторы — хрупко, ломается при обновлении UI.
 * РЕШЕНИЕ: перехват HTTP-ответов на уровне страницы через инъекцию JS.
 *
 * Вдохновлено: page.route() из Playwright API + Chat2API SSE-streaming
 * Ограничение: мы работаем через MCP Playwright, не имеем прямого доступа к page.route(),
 * поэтому перехват реализован через page-level JS injection.
 *
 * Вызов:
 * 1. browser_evaluate(filename='network-hooks.js') — установить хуки
 * 2. browser_evaluate('window.__netBuffer.getLatest()') — прочитать последний ответ
 * 3. browser_evaluate('window.__netBuffer.flush()') — сбросить буфер
 */
(() => {
  // Идемпотентность — не устанавливать хуки дважды
  if (window.__netHooksInstalled) {
    return { status: 'already_installed', bufferLen: window.__netBuffer?.entries?.length || 0 };
  }

  // === Сохраняем оригинальные API до первой установки ===
  if (!window.__origFetch) window.__origFetch = window.fetch;
  if (!window.__origEventSource) window.__origEventSource = window.EventSource;
  if (!window.__origXHR) window.__origXHR = window.XMLHttpRequest;

  // === Конфигурация паттернов API-эндпоинтов по провайдерам ===
  const API_PATTERNS = {
    glm:      ['/api/v2/chat/completions', '/api/chat/', '/api/conversation/', '/completions', '/chat/'],
    qwen:     ['/api/v2/chat/completions', '/api/chat/', '/api/conversation/', '/completions'],
    deepseek: ['/api/v0/chat/completion', '/api/v0/chat/', '/api/chat/', '/completions'],
  };

  // Определяем провайдера по URL
  const host = location.hostname;
  const providerKey = host.includes('z.ai') ? 'glm'
                    : host.includes('qwen') ? 'qwen'
                    : host.includes('deepseek') ? 'deepseek'
                    : 'unknown';
  const patterns = API_PATTERNS[providerKey] || [];

  // === Буфер сетевых ответов ===
  window.__netBuffer = {
    entries: [],       // [{url, status, body, timestamp, provider, sseTokens}]
    _maxEntries: 50,   // ограничение памяти

    add(entry) {
      this.entries.push(entry);
      if (this.entries.length > this._maxEntries) {
        this.entries.shift();
      }
    },

    /** Последний ответ от чат-API */
    getLatest() {
      const chatEntries = this.entries.filter(e =>
        patterns.some(p => e.url.includes(p))
      );
      const entry = chatEntries[chatEntries.length - 1] || null;
      
      // Автопарсинг: если sseTokens пустой но body есть — парсим body
      if (entry && (!entry.sseTokens || entry.sseTokens.length === 0) && entry.body) {
        entry.sseTokens = parseSSETokens(entry.body);
      }
      
      return entry;
    },

    /** Собрать все SSE-токены из последнего ответа */
    getLatestTokens() {
      const latest = this.getLatest();
      if (!latest?.sseTokens?.length) return null;
      // Фильтруем только answer phase (не thinking)
      const answerTokens = latest.sseTokens.filter(t => t.phase !== 'thinking');
      return answerTokens.map(t => typeof t === 'string' ? t : t.text).join('');
    },

    /** Собрать thinking-токены из последнего ответа */
    getLatestThinking() {
      const latest = this.getLatest();
      if (!latest?.sseTokens?.length) return null;
      const thinkingTokens = latest.sseTokens.filter(t => t.phase === 'thinking');
      return thinkingTokens.map(t => typeof t === 'string' ? t : t.text).join('');
    },

    /** Сбросить буфер */
    flush() {
      this.entries = [];
      return { flushed: true };
    },

    /** Статистика для диагностики */
    stats() {
      return {
        totalEntries: this.entries.length,
        chatEntries: this.entries.filter(e => patterns.some(p => e.url.includes(p))).length,
        provider: providerKey,
        patterns: patterns.length,
      };
    }
  };

  // === Вспомогательная: парсинг SSE из текста ===
  function parseSSETokens(text) {
    const tokens = [];
    const lines = text.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') break;
      try {
        const json = JSON.parse(data);
        // GLM-специфичный формат: {type:"chat:completion", data:{delta_content:"...", phase:"thinking|answer"}}
        const glmContent = json?.data?.delta_content;
        if (glmContent) {
          tokens.push({ text: glmContent, phase: json?.data?.phase || json?.phase || 'answer' });
          continue;
        }
        // OpenAI-совместимый формат: choices[0].delta.content
        const openaiContent = json?.choices?.[0]?.delta?.content
                           || json?.choices?.[0]?.message?.content
                           || json?.data?.content
                           || json?.content
                           || '';
        if (openaiContent) tokens.push({ text: openaiContent, phase: 'answer' });
      } catch {
        // Не JSON — возможно plain text SSE
        if (data) tokens.push({ text: data, phase: 'unknown' });
      }
    }
    return tokens;
  }

  // === Проверка: URL относится к чат-API? ===
  function isChatAPI(url) {
    return patterns.some(p => url.includes(p));
  }

  // === Перехват fetch ===
  const originalFetch = window.__origFetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0]
              : args[0]?.url || args[0]?.href || '';
    const response = await originalFetch.apply(this, args);

    if (isChatAPI(url)) {
      // Перехват через ReadableStream tee() — читаем стрим по чанкам
      const [stream1, stream2] = response.body.tee();
      
      // Асинхронно читаем наш стрим и парсим SSE по чанкам
      const reader = stream2.getReader();
      const decoder = new TextDecoder();
      let sseTokens = [];
      let buffer = '';
      
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            
            // Парсим полные строки из буфера
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Последняя неполная строка остаётся в буфере
            
            for (const line of lines) {
              if (!line.startsWith('data:')) continue;
              const data = line.slice(5).trim();
              if (data === '[DONE]') break;
              try {
                const json = JSON.parse(data);
                const glmContent = json?.data?.delta_content;
                if (glmContent) { sseTokens.push({ text: glmContent, phase: json?.data?.phase || 'answer' }); continue; }
                const openaiContent = json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || '';
                if (openaiContent) sseTokens.push({ text: openaiContent, phase: 'answer' });
              } catch { if (data) sseTokens.push({ text: data, phase: 'unknown' }); }
            }
            
            // Обновляем запись в буфере (добавляем токены по мере поступления)
            const existingEntry = window.__netBuffer.entries.find(e => e.url === url && e.method === 'fetch' && e.timestamp === window.__netBuffer._currentFetchTs);
            if (existingEntry) {
              existingEntry.sseTokens = [...sseTokens];
              existingEntry.body = (existingEntry.body || '') + decoder.decode(value, { stream: true });
            }
          }
          
          // Финализация — добавляем полную запись в буфер
          window.__netBuffer.add({
            url,
            status: response.status,
            body: '',
            sseTokens,
            timestamp: Date.now(),
            provider: providerKey,
            method: 'fetch-stream',
            complete: true,
          });
        } catch (e) {
          console.warn('[network-hooks] Stream read error:', e.message);
        }
      })();
      
      // Возвращаем оригинальный стрим
      return new Response(stream1, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    return response;
  };

  // === Перехват EventSource (SSE) ===
  const OrigEventSource = window.__origEventSource;
  window.EventSource = function(url, opts) {
    const es = new OrigEventSource(url, opts);

    if (isChatAPI(url)) {
      es.addEventListener('message', (e) => {
        const sseTokens = parseSSETokens(e.data);
        window.__netBuffer.add({
          url,
          status: 200,
          body: e.data.slice(0, 5000),
          sseTokens: sseTokens.length ? sseTokens : [e.data],
          timestamp: Date.now(),
          provider: providerKey,
          method: 'eventsource',
        });
      });

      es.addEventListener('error', () => {
        window.__netBuffer.add({
          url,
          status: 'error',
          body: '',
          sseTokens: [],
          timestamp: Date.now(),
          provider: providerKey,
          method: 'eventsource',
          error: true,
        });
      });
    }

    return es;
  };

  // Копируем статические свойства
  window.EventSource.CONNECTING = OrigEventSource.CONNECTING;
  window.EventSource.OPEN = OrigEventSource.OPEN;
  window.EventSource.CLOSED = OrigEventSource.CLOSED;
  window.EventSource.prototype = OrigEventSource.prototype;

  // === Перехват XMLHttpRequest (для полноты) ===
  const OrigXHR = window.__origXHR;
  window.XMLHttpRequest = function() {
    const xhr = new OrigXHR();
    const origOpen = xhr.open.bind(xhr);

    xhr.open = function(method, url, ...rest) {
      xhr._netHookUrl = url;
      return origOpen(method, url, ...rest);
    };

    const origLoad = xhr.onload;
    xhr.onload = function(event) {
      if (isChatAPI(xhr._netHookUrl || '')) {
        const sseTokens = parseSSETokens(xhr.responseText);
        window.__netBuffer.add({
          url: xhr._netHookUrl,
          status: xhr.status,
          body: xhr.responseText.slice(0, 10000),
          sseTokens,
          timestamp: Date.now(),
          provider: providerKey,
          method: 'xhr',
        });
      }
      if (origLoad) origLoad.call(this, event);
    };

    return xhr;
  };

  // Отметка что хуки установлены
  window.__netHooksInstalled = true;

  return {
    status: 'installed',
    provider: providerKey,
    patterns: patterns.length,
    hint: 'Network hooks active. Use window.__netBuffer.getLatest() to read responses.',
  };
})()
