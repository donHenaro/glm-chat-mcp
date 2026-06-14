/**
 * scripts/ai-extract.js v14.0
 * AI-powered extract fallback — извлечение ответа через DOM analysis
 * когда network buffer пуст И DOM-селекторы не сработали.
 *
 * ПРОБЛЕМА: при обновлении UI провайдеров селекторы ломаются,
 * а network hooks могут быть не установлены.
 * РЕШЕНИЕ: гибкий поиск текста ответа по эвристикам без привязки к селекторам.
 *
 * Вдохновлено: Stagehand extract() + наш опыт с fallback-цепочками
 *
 * Стратегии (по приоритету):
 * 1. Accessibility tree (role="article", role="log")
 * 2. Message container heuristic (class*="message", class*="chat-message")
 * 3. Longest prose block (наибольший блок текста на странице)
 * 4. Last significant DOM change (MutationObserver record)
 *
 * Вызов: browser_evaluate(filename='ai-extract.js')
 * Затем: browser_evaluate('window.__aiExtract.extract()')
 *        browser_evaluate('window.__aiExtract.detect()')
 */
(() => {
  if (window.__aiExtract) {
    return { status: 'already_initialized' };
  }

  const host = location.hostname;
  const provider = host.includes('z.ai') ? 'glm'
                 : host.includes('qwen') ? 'qwen'
                 : host.includes('deepseek') ? 'deepseek'
                 : 'unknown';

  // === Стратегия 1: Accessibility roles ===
  function extractByRole() {
    const roles = ['article', 'log', 'region', 'status'];
    for (const role of roles) {
      const els = document.querySelectorAll(`[role="${role}"]`);
      if (els.length > 0) {
        const last = els[els.length - 1];
        const text = (last.innerText || '').trim();
        if (text.length > 20) {
          return { text, source: `role:${role}`, len: text.length };
        }
      }
    }
    return null;
  }

  // === Стратегия 2: Message container heuristic ===
  function extractByMessageContainer() {
    const patterns = [
      '[class*="message"]',
      '[class*="chat-message"]',
      '[class*="response"]',
      '[class*="assistant"]',
      '[data-role="assistant"]',
      '[data-message-role="assistant"]',
    ];

    for (const sel of patterns) {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          // Берём последний элемент с достаточным текстом
          for (let i = els.length - 1; i >= 0; i--) {
            const text = (els[i].innerText || '').trim();
            if (text.length > 20) {
              // Фильтруем — исключаем кнопки, навигацию и т.д.
              const btnCount = els[i].querySelectorAll('button').length;
              const linkCount = els[i].querySelectorAll('a').length;
              const wordCount = text.split(/\s+/).length;
              // Хороший ответ: много слов, мало кнопок/ссылок
              if (wordCount > 5 && btnCount < 10 && linkCount < 10) {
                return { text, source: `container:${sel}`, len: text.length };
              }
            }
          }
        }
      } catch { /* invalid selector */ }
    }
    return null;
  }

  // === Стратегия 3: Longest prose block ===
  function extractByLongestProse() {
    // Ищем блочные элементы с наибольшим количеством текста
    const blockSelectors = 'div, section, article, main, p, pre, code';
    const blocks = document.querySelectorAll(blockSelectors);
    let best = null;
    let bestLen = 0;

    for (const block of blocks) {
      // Пропускаем если элемент содержит много дочерних блочных элементов
      // (навигация, хедер, футер)
      const children = block.querySelectorAll(blockSelectors);
      if (children.length > 20) continue;

      const text = (block.innerText || '').trim();
      // Ищем значимый текст (не навигацию)
      const wordCount = text.split(/\s+/).length;
      const hasCodeBlocks = block.querySelectorAll('pre, code').length > 0;
      const hasMarkdown = text.includes('```') || text.includes('##');

      // Критерии "ответа": достаточно длинный, содержит код или markdown
      const isProse = (wordCount > 20 && text.length > bestLen) ||
                      (hasCodeBlocks && text.length > 100) ||
                      (hasMarkdown && text.length > 100);

      if (isProse && text.length > bestLen) {
        // Проверяем что не header/footer/nav
        const tag = block.tagName.toLowerCase();
        const cls = block.className || '';
        if (tag === 'header' || tag === 'footer' || tag === 'nav') continue;
        if (cls.includes('header') || cls.includes('footer') || cls.includes('nav') ||
            cls.includes('sidebar') || cls.includes('menu') || cls.includes('toolbar')) continue;

        best = block;
        bestLen = text.length;
      }
    }

    if (best) {
      const text = (best.innerText || '').trim();
      return { text: text.slice(0, 10000), source: 'longest-prose', len: text.length };
    }
    return null;
  }

  // === Стратегия 4: Spinner area ===
  // Ищем текст рядом со spinner — это текущий ответ
  function extractNearSpinner() {
    const spinnerPatterns = [
      '[class*="spinner"]', '[class*="loading"]', '[class*="generating"]',
      '[class*="typing"]', '[class*="thinking"]',
    ];

    for (const sel of spinnerPatterns) {
      const spinner = document.querySelector(sel);
      if (!spinner) continue;

      // Ищем ближайший родительский контейнер с текстом
      let container = spinner.parentElement;
      for (let depth = 0; depth < 5 && container; depth++) {
        const text = (container.innerText || '').trim();
        if (text.length > 20) {
          // Убираем текст spinner'а
          const cleanText = text.replace(/⏳|🔄|💬|.../g, '').trim();
          if (cleanText.length > 20) {
            return { text: cleanText, source: `near-spinner:${sel}`, len: cleanText.length };
          }
        }
        container = container.parentElement;
      }
    }
    return null;
  }

  // === Основной API ===
  window.__aiExtract = {
    provider,

    /**
     * Извлечь ответ — попробовать все стратегии
     * @returns {{text, source, len, strategy}|null}
     */
    extract() {
      // Приоритет 0: network buffer (если hooks установлены)
      const netTokens = window.__netBuffer?.getLatestTokens?.();
      if (netTokens && netTokens.length > 0) {
        return { text: netTokens, source: 'network', len: netTokens.length, strategy: 0 };
      }

      // Приоритет 1: проверенные селекторы (из response.js)
      try {
        const strategies = {
          glm: ['.markdown-prose', '[class*="prose"]', '[data-message-role="assistant"]'],
          qwen: ['[class*="message-content"]', '.markdown-body', '[role="article"]'],
          deepseek: ['.ds-markdown', '[class*="markdown"]', '[role="article"]'],
        };
        const sels = strategies[this.provider] || strategies.glm;
        for (const sel of sels) {
          try {
            const els = document.querySelectorAll(sel);
            if (els.length > 0) {
              const last = els[els.length - 1];
              const text = (last.innerText || '').replace(/^Thought Process\n/, '').trim();
              if (text.length > 20) {
                return { text, source: `selector:${sel}`, len: text.length, strategy: 1 };
              }
            }
          } catch {}
        }
      } catch {}

      // Приоритет 2: Accessibility roles
      const byRole = extractByRole();
      if (byRole) return { ...byRole, strategy: 2 };

      // Приоритет 3: Message containers
      const byContainer = extractByMessageContainer();
      if (byContainer) return { ...byContainer, strategy: 3 };

      // Приоритет 4: Near spinner
      const bySpinner = extractNearSpinner();
      if (bySpinner) return { ...bySpinner, strategy: 4 };

      // Приоритет 5: Longest prose
      const byProse = extractByLongestProse();
      if (byProse) return { ...byProse, strategy: 5 };

      return null;
    },

    /**
     * Детекция состояния страницы — что видно?
     * @returns {{hasInput, hasResponse, hasSpinner, provider, strategies}}
     */
    detect() {
      const hasInput = !!document.querySelector('#chat-input, textarea, [contenteditable]');
      const hasSpinner = !!document.querySelector('[class*="spinner"], [class*="loading"]');

      return {
        provider: this.provider,
        url: location.href,
        hasInput,
        hasSpinner,
        networkBuffer: window.__netBuffer?.stats?.() || null,
        strategies: {
          role: !!extractByRole(),
          container: !!extractByMessageContainer(),
          prose: !!extractByLongestProse(),
          spinner: !!extractNearSpinner(),
        },
      };
    },

    /**
     * Полная диагностика — что видно на странице
     */
    diagnose() {
      const extractResult = this.extract();
      const detectResult = this.detect();

      return {
        extract: extractResult,
        detect: detectResult,
        dom: {
          allDivs: document.querySelectorAll('div').length,
          allArticles: document.querySelectorAll('article, [role="article"]').length,
          allButtons: document.querySelectorAll('button').length,
          bodyTextLen: (document.body?.innerText || '').length,
        },
        hint: extractResult
          ? `Found response via ${extractResult.source} (${extractResult.len} chars)`
          : 'No response found — all strategies exhausted',
      };
    },
  };

  return {
    status: 'initialized',
    provider,
    hint: 'Use window.__aiExtract.extract() / .detect() / .diagnose()',
  };
})()
