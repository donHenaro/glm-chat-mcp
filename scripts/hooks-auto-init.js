/**
 * scripts/hooks-auto-init.js v14.0
 * Auto-init network hooks + debug logging — автоматически инжектит
 * перехват SSE при появлении чата GLM/Qwen/DeepSeek.
 *
 * ПРОБЛЕМА: хуки нужно устанавливать вручную через browser_evaluate.
 * РЕШЕНИЕ: авто-детекция провайдера + инъекция хуков + логирование.
 *
 * Вызов: browser_evaluate(filename='hooks-auto-init.js')
 * - Автоматически инжектит network-hooks.js если не установлен
 * - Автоматически инжектит debug-trace.js
 * - Логирует все действия в window.__trace
 */
(() => {
  // === Debug Logging ===
  const DEBUG = true;
  const Debug = {
    log:    (m, ...a) => DEBUG && console.log(`%c[${m}]`, 'color: #00bfff; font-weight: bold;', ...a),
    warn:   (m, ...a) => DEBUG && console.warn(`%c[${m}]`, 'color: orange; font-weight: bold;', ...a),
    error:  (m, ...a) => DEBUG && console.error(`%c[${m}]`, 'color: red; font-weight: bold;', ...a),
    success:(m, ...a) => DEBUG && console.log(`%c[${m}]`, 'color: #0f0; font-weight: bold;', ...a),
  };
  window.__netDebug = Debug;

  // === Provider detection ===
  const host = location.hostname;
  const provider = host.includes('z.ai') ? 'glm'
                 : host.includes('qwen') ? 'qwen'
                 : host.includes('deepseek') ? 'deepseek'
                 : 'unknown';

  Debug.log('AUTO-INIT', `Provider: ${provider}, URL: ${location.href}`);

  // === Step 1: Install network hooks (if not installed) ===
  if (!window.__netHooksInstalled) {
    Debug.log('AUTO-INIT', 'Installing network hooks...');

    const API_PATTERNS = {
      glm: ['/api/v2/chat/completions', '/api/chat/', '/api/conversation/', '/completions', '/chat/'],
      qwen: ['/api/chat/', '/api/conversation/', '/completions'],
      deepseek: ['/api/chat/', '/api/v0/chat/', '/completions'],
    };
    const patterns = API_PATTERNS[provider] || [];

    if (!window.__origFetch) window.__origFetch = window.fetch;
    if (!window.__origEventSource) window.__origEventSource = window.EventSource;

    function parseSSETokens(text) {
      const tokens = [];
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') break;
        try {
          const json = JSON.parse(data);
          const glmContent = json?.data?.delta_content;
          if (glmContent) { tokens.push({ text: glmContent, phase: json?.data?.phase || 'answer' }); continue; }
          const openaiContent = json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || '';
          if (openaiContent) tokens.push({ text: openaiContent, phase: 'answer' });
        } catch {}
      }
      return tokens;
    }

    window.__netBuffer = {
      entries: [], _maxEntries: 50,
      add(entry) { this.entries.push(entry); if (this.entries.length > this._maxEntries) this.entries.shift(); },
      getLatest() {
        const ce = this.entries.filter(e => patterns.some(p => e.url.includes(p)));
        const entry = ce[ce.length - 1] || null;
        if (entry && (!entry.sseTokens || entry.sseTokens.length === 0) && entry.body) {
          entry.sseTokens = parseSSETokens(entry.body);
        }
        return entry;
      },
      getLatestTokens() { const l = this.getLatest(); if (!l?.sseTokens?.length) return null; return l.sseTokens.filter(t => t.phase !== 'thinking').map(t => typeof t === 'string' ? t : t.text).join(''); },
      getLatestThinking() { const l = this.getLatest(); if (!l?.sseTokens?.length) return null; return l.sseTokens.filter(t => t.phase === 'thinking').map(t => typeof t === 'string' ? t : t.text).join(''); },
      flush() { this.entries = []; return { flushed: true }; },
      stats() { return { totalEntries: this.entries.length, chatEntries: this.entries.filter(e => patterns.some(p => e.url.includes(p))).length, provider, patterns: patterns.length }; }
    };

    // Fetch interceptor with tee() + clone() fallback
    const originalFetch = window.__origFetch;
    window.fetch = async function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || args[0]?.href || '';
      const response = await originalFetch.apply(this, args);

      if (patterns.some(p => url.includes(p))) {
        Debug.success('NET', `Intercepted: ${url.slice(0, 60)}`);
        try {
          const [stream1, stream2] = response.body.tee();
          const reader = stream2.getReader();
          const decoder = new TextDecoder();
          let sseTokens = [], fullBody = '';
          (async () => {
            try {
              let buffer = '';
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                fullBody += chunk; buffer += chunk;
                const lines = buffer.split('\n'); buffer = lines.pop() || '';
                for (const line of lines) {
                  if (!line.startsWith('data:')) continue;
                  const data = line.slice(5).trim();
                  if (data === '[DONE]') break;
                  try {
                    const json = JSON.parse(data);
                    const gc = json?.data?.delta_content;
                    if (gc) { sseTokens.push({ text: gc, phase: json?.data?.phase || 'answer' }); continue; }
                    const oc = json?.choices?.[0]?.delta?.content || '';
                    if (oc) sseTokens.push({ text: oc, phase: 'answer' });
                  } catch {}
                }
              }
              window.__netBuffer.add({ url, status: response.status, body: fullBody.slice(0, 10000), sseTokens, timestamp: Date.now(), provider, method: 'fetch-stream', complete: true });
              Debug.success('NET', `Buffered ${sseTokens.length} tokens`);
            } catch (e) { Debug.error('NET', 'Stream error:', e.message); }
          })();
          return new Response(stream1, { status: response.status, statusText: response.statusText, headers: response.headers });
        } catch {
          Debug.warn('NET', 'tee() failed, clone() fallback');
          const cloned = response.clone();
          cloned.text().then(body => {
            const sseTokens = parseSSETokens(body);
            window.__netBuffer.add({ url, status: response.status, body: body.slice(0, 10000), sseTokens, timestamp: Date.now(), provider, method: 'fetch-clone', complete: true });
          }).catch(() => {});
          return response;
        }
      }
      return response;
    };

    window.__netHooksInstalled = true;
    Debug.success('AUTO-INIT', 'Network hooks installed');
  } else {
    Debug.log('AUTO-INIT', 'Network hooks already installed');
  }

  // === Step 2: Initialize debug trace ===
  if (!window.__trace) {
    window.__trace = {
      entries: [], _maxEntries: 200,
      log(a, d = {}) { const e = { ts: Date.now(), iso: new Date().toISOString(), action: a, ...d }; this.entries.push(e); if (this.entries.length > this._maxEntries) this.entries.shift(); return e; },
      error(a, e, d = {}) { return this.log(`error:${a}`, { errorMessage: e?.message || String(e), ...d }); },
      success(a, r = {}) { return this.log(`success:${a}`, r); },
      startTimer(l) { window[`__timer_${l}`] = Date.now(); },
      endTimer(l) { const s = window[`__timer_${l}`]; if (!s) return -1; const d = Date.now() - s; delete window[`__timer_${l}`]; this.log(`timer:end:${l}`, { durationMs: d }); return d; },
      dump(n = 50) { return this.entries.slice(-n); },
      stats() { return { totalEntries: this.entries.length, errors: this.entries.filter(e => e.action.startsWith('error:')).length }; },
      clear() { this.entries = []; return { cleared: true }; },
      export() { return this.entries.map(e => `| ${e.iso} | ${e.action} |`).join('\n'); },
    };
    Debug.success('AUTO-INIT', 'Debug trace initialized');
  }

  // === Step 3: Initialize adapters (if provider-adapter.js SSE classes were loaded) ===
  if (!window.__currentAdapter && window.GLMAdapter) {
    window.__currentAdapter = provider === 'glm' ? new GLMAdapter() : new OpenAIAdapter();
    Debug.success('AUTO-INIT', `Adapter: ${window.__currentAdapter.constructor.name}`);
  }

  // === Log result ===
  window.__trace?.success('auto-init', { provider, hooks: window.__netHooksInstalled, adapter: !!window.__currentAdapter });

  return {
    status: 'auto-initialized',
    provider,
    hooksInstalled: window.__netHooksInstalled,
    bufferLen: window.__netBuffer?.entries?.length || 0,
    adapterLoaded: !!window.__currentAdapter,
    hint: 'All systems ready. Network hooks + debug trace active.',
  };
})()
