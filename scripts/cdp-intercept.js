/**
 * scripts/cdp-intercept.js v14.0
 * CDP-based interception — перехват WebSocket-ответов провайдеров.
 *
 * ПРОБЛЕМА: некоторые провайдеры (DeepSeek, Qwen) могут использовать WebSocket
 * вместо SSE для стриминга ответов. fetch/EventSource перехват не работает.
 * РЕШЕНИЕ: перехват WebSocket через monkey-patching + CDP Network.webSocketFrameReceived.
 *
 * Вдохновлено: Playwright CDP Session + browser_network_requests MCP tool
 *
 * Вызов: browser_evaluate(filename='cdp-intercept.js')
 * Затем: browser_evaluate('window.__wsBuffer.getLatest()')
 */
(() => {
  if (window.__wsHooksInstalled) {
    return { status: 'already_installed', bufferLen: window.__wsBuffer?.entries?.length || 0 };
  }

  // === Provider detection ===
  const host = location.hostname;
  const provider = host.includes('z.ai') ? 'glm'
                 : host.includes('qwen') ? 'qwen'
                 : host.includes('deepseek') ? 'deepseek'
                 : 'unknown';

  const WS_PATTERNS = {
    glm:      ['chat.z.ai', '/ws/', '/socket/', '/api/chat'],
    qwen:     ['chat.qwen.ai', '/ws/', '/socket/', '/api/chat'],
    deepseek: ['chat.deepseek.com', '/ws/', '/socket/', '/api/chat'],
  };

  const patterns = WS_PATTERNS[provider] || [];

  // === WebSocket Buffer ===
  window.__wsBuffer = {
    entries: [],        // [{url, direction, data, timestamp, provider}]
    _maxEntries: 100,

    add(entry) {
      this.entries.push(entry);
      if (this.entries.length > this._maxEntries) this.entries.shift();
    },

    /** Получить последние входящие сообщения */
    getIncoming() {
      return this.entries.filter(e => e.direction === 'incoming');
    },

    /** Получить последние исходящие сообщения */
    getOutgoing() {
      return this.entries.filter(e => e.direction === 'outgoing');
    },

    /** Попробовать извлечь текст ответа из WebSocket сообщений */
    extractResponse() {
      const incoming = this.getIncoming();
      const textParts = [];

      for (const msg of incoming) {
        try {
          const json = JSON.parse(msg.data);
          // GLM WebSocket format (hypothetical)
          const glmContent = json?.data?.delta_content || json?.data?.content;
          if (glmContent) { textParts.push({ text: glmContent, phase: json?.data?.phase || 'answer' }); continue; }

          // OpenAI-compatible WebSocket format
          const openaiContent = json?.choices?.[0]?.delta?.content;
          if (openaiContent) { textParts.push({ text: openaiContent, phase: 'answer' }); continue; }

          // Generic text field
          if (json?.text && typeof json.text === 'string' && json.text.length > 10) {
            textParts.push({ text: json.text, phase: 'answer' });
          }
        } catch {
          // Not JSON — check if it's plain text SSE over WebSocket
          if (msg.data?.startsWith('data:')) {
            const data = msg.data.slice(5).trim();
            if (data !== '[DONE]') {
              try {
                const json = JSON.parse(data);
                const content = json?.data?.delta_content || json?.choices?.[0]?.delta?.content || '';
                if (content) textParts.push({ text: content, phase: json?.data?.phase || 'answer' });
              } catch {
                if (data.length > 10) textParts.push({ text: data, phase: 'unknown' });
              }
            }
          }
        }
      }

      const answerText = textParts.filter(t => t.phase === 'answer').map(t => t.text).join('');
      const thinkingText = textParts.filter(t => t.phase === 'thinking').map(t => t.text).join('');

      return {
        answerText,
        thinkingText,
        tokens: textParts.length,
        hasContent: answerText.length > 0 || thinkingText.length > 0,
      };
    },

    /** Статистика */
    stats() {
      return {
        totalEntries: this.entries.length,
        incoming: this.getIncoming().length,
        outgoing: this.getOutgoing().length,
        provider,
        patterns: patterns.length,
      };
    },

    /** Сбросить буфер */
    flush() {
      this.entries = [];
      return { flushed: true };
    },
  };

  // === Перехват WebSocket ===
  const OrigWebSocket = window.WebSocket;

  window.WebSocket = function(url, protocols) {
    const ws = protocols ? new OrigWebSocket(url, protocols) : new OrigWebSocket(url);
    const isChatWS = patterns.some(p => url.includes(p));

    if (isChatWS) {
      console.log(`[cdp-intercept] WebSocket opened: ${url.slice(0, 60)}`);

      // Перехват incoming messages
      const origOnMessage = ws.onmessage;
      ws.addEventListener('message', (event) => {
        const data = typeof event.data === 'string' ? event.data : '[binary]';
        window.__wsBuffer.add({
          url: url.slice(0, 200),
          direction: 'incoming',
          data: data.slice(0, 5000),
          timestamp: Date.now(),
          provider,
        });
      });

      // Перехват outgoing messages
      const origSend = ws.send.bind(ws);
      ws.send = function(data) {
        const strData = typeof data === 'string' ? data : '[binary]';
        window.__wsBuffer.add({
          url: url.slice(0, 200),
          direction: 'outgoing',
          data: strData.slice(0, 5000),
          timestamp: Date.now(),
          provider,
        });
        return origSend(data);
      };

      // Логирование закрытия
      ws.addEventListener('close', (event) => {
        window.__wsBuffer.add({
          url: url.slice(0, 200),
          direction: 'close',
          data: `code=${event.code} reason=${event.reason}`,
          timestamp: Date.now(),
          provider,
        });
      });

      // Логирование ошибок
      ws.addEventListener('error', () => {
        window.__wsBuffer.add({
          url: url.slice(0, 200),
          direction: 'error',
          data: 'WebSocket error',
          timestamp: Date.now(),
          provider,
        });
      });
    }

    return ws;
  };

  // Копируем статические свойства
  window.WebSocket.CONNECTING = OrigWebSocket.CONNECTING;
  window.WebSocket.OPEN = OrigWebSocket.OPEN;
  window.WebSocket.CLOSING = OrigWebSocket.CLOSING;
  window.WebSocket.CLOSED = OrigWebSocket.CLOSED;
  window.WebSocket.prototype = OrigWebSocket.prototype;

  // === Перехват EventSource (дополнение к network-hooks.js) ===
  // Если network-hooks.js не установлен, перехватываем EventSource здесь
  if (!window.__netHooksInstalled) {
    console.warn('[cdp-intercept] network-hooks.js not installed — EventSource interception will be limited');

    const OrigES = window.EventSource;
    window.EventSource = function(url, opts) {
      const es = new OrigES(url, opts);
      const isChatES = patterns.some(p => url.includes(p));

      if (isChatES) {
        es.addEventListener('message', (event) => {
          window.__wsBuffer.add({
            url: url.slice(0, 200),
            direction: 'incoming',
            data: event.data?.slice(0, 5000) || '',
            timestamp: Date.now(),
            provider,
            protocol: 'eventsource',
          });
        });
      }

      return es;
    };
    window.EventSource.CONNECTING = OrigES.CONNECTING;
    window.EventSource.OPEN = OrigES.OPEN;
    window.EventSource.CLOSED = OrigES.CLOSED;
  }

  window.__wsHooksInstalled = true;

  return {
    status: 'installed',
    provider,
    wsPatterns: patterns.length,
    hint: 'WebSocket interception active. Use window.__wsBuffer.extractResponse() to get chat responses.',
  };
})()
