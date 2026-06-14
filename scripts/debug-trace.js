/**
 * scripts/debug-trace.js v14.0
 * Debug tracing — логирование всех действий для диагностики проблем.
 *
 * ПРОБЛЕМА: сложно диагностировать ошибки в продакшене.
 * РЕШЕНИЕ: автоматический trace при ошибках, сохранение хронологии.
 *
 * Вдохновлено: Playwright Tracing API + Steel.dev observability
 *
 * Вызов: browser_evaluate(filename='debug-trace.js')
 * Затем: browser_evaluate('window.__trace.log("action", data)')
 *        browser_evaluate('window.__trace.dump()')
 *        browser_evaluate('window.__trace.export()')
 */
(() => {
  if (window.__trace) {
    return { status: 'already_initialized', entries: window.__trace.entries.length };
  }

  window.__trace = {
    entries: [],
    _maxEntries: 200,

    /** Записать действие в трейс */
    log(action, data = {}) {
      const entry = {
        ts: Date.now(),
        iso: new Date().toISOString(),
        action,
        ...data,
      };
      this.entries.push(entry);
      if (this.entries.length > this._maxEntries) {
        this.entries.shift();
      }
      return entry;
    },

    /** Записать ошибку */
    error(action, error, data = {}) {
      return this.log(`error:${action}`, {
        errorMessage: error?.message || String(error),
        errorStack: error?.stack?.slice(0, 500),
        ...data,
      });
    },

    /** Записать успешное действие */
    success(action, result = {}) {
      return this.log(`success:${action}`, {
        resultPreview: typeof result === 'string' ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200),
        ...result,
      });
    },

    /** Начать замер времени */
    startTimer(label) {
      const key = `__timer_${label}`;
      window[key] = Date.now();
      this.log(`timer:start:${label}`);
    },

    /** Закончить замер времени */
    endTimer(label) {
      const key = `__timer_${label}`;
      const start = window[key];
      if (!start) {
        this.log(`timer:unknown:${label}`);
        return -1;
      }
      const duration = Date.now() - start;
      delete window[key];
      this.log(`timer:end:${label}`, { durationMs: duration });
      return duration;
    },

    /** Дамп трейса — последние N записей */
    dump(lastN = 50) {
      return this.entries.slice(-lastN);
    },

    /** Экспорт трейса как Markdown */
    export() {
      const lines = ['# Debug Trace', `Generated: ${new Date().toISOString()}`, `Entries: ${this.entries.length}`, ''];

      for (const entry of this.entries) {
        const ts = entry.iso || new Date(entry.ts).toISOString();
        const data = { ...entry };
        delete data.ts;
        delete data.iso;
        delete data.action;
        const dataStr = Object.keys(data).length > 0 ? ' ' + JSON.stringify(data) : '';
        lines.push(`| ${ts} | ${entry.action} |${dataStr}|`);
      }

      return lines.join('\n');
    },

    /** Статистика трейса */
    stats() {
      const actions = {};
      for (const entry of this.entries) {
        const key = entry.action.split(':')[0] || entry.action;
        actions[key] = (actions[key] || 0) + 1;
      }

      const errors = this.entries.filter(e => e.action.startsWith('error:')).length;
      const timers = this.entries.filter(e => e.action.startsWith('timer:end:'));

      return {
        totalEntries: this.entries.length,
        errors,
        avgTimerMs: timers.length > 0
          ? Math.round(timers.reduce((sum, t) => sum + (t.durationMs || 0), 0) / timers.length)
          : 0,
        actions,
        firstEntry: this.entries[0]?.iso,
        lastEntry: this.entries[this.entries.length - 1]?.iso,
      };
    },

    /** Очистить трейс */
    clear() {
      this.entries = [];
      return { cleared: true };
    },
  };

  // Автологирование ошибок
  window.addEventListener('error', (event) => {
    window.__trace.error('global', event.error || event.message, {
      filename: event.filename,
      lineno: event.lineno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    window.__trace.error('unhandledRejection', event.reason);
  });

  return {
    status: 'initialized',
    hint: 'Use window.__trace.log(action, data) / .error() / .dump() / .export() / .stats()',
  };
})()
