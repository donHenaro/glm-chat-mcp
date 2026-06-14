/**
 * scripts/mode-switcher.js v1.0
 * Универсальный переключатель режимов провайдеров.
 *
 * Поддерживаемые режимы:
 *   GLM:       agent, chat, deepThink (on/off), search (on/off)
 *   Qwen:      deepThink (auto/on/off), model select
 *   DeepSeek:  fast, deepThink, search
 *   Kimi:      deepResearch, agentSwarm, slides, websites, docs, sheets, kimiCode, claw
 *
 * Вызов:
 *   browser_evaluate(filename='mode-switcher.js')
 *   browser_evaluate('window.__modeSwitch.switch("deepThink")')
 *   browser_evaluate('window.__modeSwitch.switch("agentSwarm")')
 *   browser_evaluate('window.__modeSwitch.list()')
 */
(() => {
  if (window.__modeSwitch) {
    return { status: 'already_initialized', modes: window.__modeSwitch.list() };
  }

  const host = location.hostname;
  const provider = host.includes('z.ai') ? 'glm'
                 : host.includes('qwen') ? 'qwen'
                 : host.includes('deepseek') ? 'deepseek'
                 : host.includes('kimi') ? 'kimi'
                 : 'unknown';

  // === Спецификации режимов по провайдерам ===
  const MODE_SPECS = {
    glm: {
      chat:      { action: 'click', find: () => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Chat') },
      agent:     { action: 'click', find: () => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Agent')) },
      deepThink: { action: 'toggle', find: () => document.querySelector('[data-autothink]'), get: () => document.querySelector('[data-autothink]')?.getAttribute('data-autothink') === 'true', on: (el) => { if (el.getAttribute('data-autothink') !== 'true') el.click(); }, off: (el) => { if (el.getAttribute('data-autothink') === 'true') el.click(); } },
      search:    { action: 'toggle', find: () => { const ta = document.querySelector('#chat-input, textarea'); const c = ta?.closest('div')?.parentElement; return c ? Array.from(c.querySelectorAll('button')).find(b => b.getAttribute('data-active') !== null && !b.getAttribute('data-autothink')) : null; }, get: () => { const ta = document.querySelector('#chat-input, textarea'); const c = ta?.closest('div')?.parentElement; const b = c ? Array.from(c.querySelectorAll('button')).find(b => b.getAttribute('data-active') !== null && !b.getAttribute('data-autothink')) : null; return b?.getAttribute('data-active') === 'true'; }, on: (el) => { if (el.getAttribute('data-active') !== 'true') el.click(); }, off: (el) => { if (el.getAttribute('data-active') === 'true') el.click(); } },
      aiPpt:     { action: 'click', find: () => Array.from(document.querySelectorAll('button, a')).find(b => b.textContent?.includes('AI PPT')) },
    },
    qwen: {
      deepThink: { action: 'toggle', find: () => document.querySelector('.qwen-thinking-selector'), get: () => !!document.querySelector('.qwen-chat-thinking-tool-status-card-wrap'), on: (el) => { if (!document.querySelector('.qwen-chat-thinking-tool-status-card-wrap')) el?.click(); }, off: (el) => { /* cycle through select */ } },
      search:    { action: 'click', find: () => document.querySelector('.chat-search-icon, [class*="search-toggle"]') },
    },
    deepseek: {
      fast:      { action: 'click', find: () => Array.from(document.querySelectorAll('*')).find(el => el.textContent?.trim() === 'Быстрый режим' || el.textContent?.trim() === 'Fast') },
      deepThink: { action: 'click', find: () => Array.from(document.querySelectorAll('*')).find(el => el.textContent?.trim() === 'Глубокое мышление' || el.textContent?.trim() === 'Deep Think') },
      search:    { action: 'click', find: () => Array.from(document.querySelectorAll('*')).find(el => el.textContent?.trim() === 'Умный поиск' || el.textContent?.trim() === 'Search') },
    },
    kimi: {
      deepResearch: { action: 'sidebar', label: 'Deep Research', find: () => { const el = Array.from(document.querySelectorAll('.agent-label')).find(e => e.textContent?.trim() === 'Deep Research'); return el?.closest('.agent-info') || el?.parentElement || el; } },
      agentSwarm:   { action: 'sidebar', label: 'Agent Swarm', find: () => { const el = Array.from(document.querySelectorAll('.agent-label')).find(e => e.textContent?.trim() === 'Agent Swarm'); return el?.closest('.agent-info') || el?.parentElement || el; } },
      slides:       { action: 'sidebar', label: 'Slides', find: () => { const el = Array.from(document.querySelectorAll('.agent-label')).find(e => e.textContent?.trim() === 'Slides'); return el?.closest('.agent-info') || el?.parentElement || el; } },
      websites:     { action: 'sidebar', label: 'Websites', find: () => { const el = Array.from(document.querySelectorAll('.agent-label')).find(e => e.textContent?.trim() === 'Websites'); return el?.closest('.agent-info') || el?.parentElement || el; } },
      docs:         { action: 'sidebar', label: 'Docs', find: () => { const el = Array.from(document.querySelectorAll('.agent-label')).find(e => e.textContent?.trim() === 'Docs'); return el?.closest('.agent-info') || el?.parentElement || el; } },
      sheets:       { action: 'sidebar', label: 'Sheets', find: () => { const el = Array.from(document.querySelectorAll('.agent-label')).find(e => e.textContent?.trim() === 'Sheets'); return el?.closest('.agent-info') || el?.parentElement || el; } },
      kimiCode:     { action: 'sidebar', label: 'Kimi Code', find: () => { const el = Array.from(document.querySelectorAll('.agent-label')).find(e => e.textContent?.trim() === 'Kimi Code'); return el?.closest('.agent-info') || el?.parentElement || el; } },
      claw:         { action: 'sidebar', label: 'Kimi Claw', find: () => { const el = Array.from(document.querySelectorAll('.agent-label')).find(e => e.textContent?.trim() === 'Kimi Claw'); return el?.closest('.agent-info') || el?.parentElement || el; } },
    },
  };

  const spec = MODE_SPECS[provider] || {};

  // === Переключатель ===
  window.__modeSwitch = {
    provider,

    /** Переключить режим. name — название режима (deepThink, agent, search, ...) */
    switch(name) {
      const mode = spec[name];
      if (!mode) {
        return { error: 'unknown_mode', provider, name, available: Object.keys(spec) };
      }

      if (mode.action === 'sidebar') {
        // Kimi sidebar: найти .agent-label по тексту, кликнуть на родителя
        const el = mode.find();
        if (el) {
          el.click();
          return { switched: true, provider, mode: name, method: 'sidebar', label: mode.label };
        }
        return { error: 'not_found', provider, mode: name, label: mode.label };
      }

      if (mode.action === 'click') {
        const el = mode.find();
        if (el) {
          el.click();
          return { switched: true, provider, mode: name, method: 'click' };
        }
        return { error: 'not_found', provider, mode: name };
      }

      if (mode.action === 'toggle') {
        const el = mode.find();
        if (!el) return { error: 'not_found', provider, mode: name };
        const currentState = mode.get();
        // Toggle: если не указано явно — переключить
        mode.on(el);
        return { switched: true, provider, mode: name, wasEnabled: currentState, method: 'toggle' };
      }

      return { error: 'unknown_action', provider, mode: name, action: mode.action };
    },

    /** Включить режим (для toggle) */
    on(name) {
      const mode = spec[name];
      if (!mode || !mode.on) return { error: 'not_toggle', provider, mode: name };
      const el = mode.find();
      if (!el) return { error: 'not_found', provider, mode: name };
      mode.on(el);
      return { enabled: true, provider, mode: name };
    },

    /** Выключить режим (для toggle) */
    off(name) {
      const mode = spec[name];
      if (!mode || !mode.off) return { error: 'not_toggle', provider, mode: name };
      const el = mode.find();
      if (!el) return { error: 'not_found', provider, mode: name };
      mode.off(el);
      return { disabled: true, provider, mode: name };
    },

    /** Получить состояние режима */
    status(name) {
      const mode = spec[name];
      if (!mode) return { error: 'unknown_mode', provider, mode: name };
      if (mode.get) {
        return { provider, mode: name, enabled: mode.get() };
      }
      const el = mode.find();
      return { provider, mode: name, available: !!el };
    },

    /** Список доступных режимов */
    list() {
      const modes = {};
      for (const [name, mode] of Object.entries(spec)) {
        const el = mode.find?.();
        modes[name] = {
          action: mode.action,
          available: !!el,
          label: mode.label || name,
        };
      }
      return { provider, modes };
    },
  };

  console.log(`[mode-switcher] Provider: ${provider}, Modes: ${Object.keys(spec).join(', ')}`);
  return window.__modeSwitch.list();
})();
