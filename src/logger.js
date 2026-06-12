/**
 * Logger для GLM Chat MCP
 * 
 * Особенности:
 * - JSON формат для машинной обработки
 * - stderr вместо stdout (не ломает MCP протокол)
 * - Уровни логирования (DEBUG, INFO, WARN, ERROR)
 * - Screenshot on Error — автоматическое сохранение при ошибках
 * - Конфигурируемый уровень через LOG_LEVEL
 */

// ============================================================
// УРОВНИ ЛОГИРОВАНИЯ
// ============================================================

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// Уровень из переменной окружения (по умолчанию INFO)
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

// ============================================================
// БАЗОВЫЙ ЛОГГЕР
// ============================================================

const logger = {
  /**
   * Форматирует запись в JSON
   */
  _format(level, message, data = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level,
      service: 'glm-chat-mcp',
      ...data,
      message,
    };
    
    // Всегда пишем в stderr, чтобы не ломать MCP stdin/stdout протокол
    console.error(JSON.stringify(logEntry));
  },

  /**
   * DEBUG уровень — подробная информация для отладки
   */
  debug(message, data) {
    if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
      this._format('DEBUG', message, data);
    }
  },

  /**
   * INFO уровень — общая информация о ходе работы
   */
  info(message, data) {
    if (CURRENT_LEVEL <= LOG_LEVELS.INFO) {
      this._format('INFO', message, data);
    }
  },

  /**
   * WARN уровень — предупреждения (не ошибки, но нужно внимание)
   */
  warn(message, data) {
    if (CURRENT_LEVEL <= LOG_LEVELS.WARN) {
      this._format('WARN', message, data);
    }
  },

  /**
   * ERROR уровень — ошибки
   */
  error(message, data) {
    if (CURRENT_LEVEL <= LOG_LEVELS.ERROR) {
      this._format('ERROR', message, data);
    }
  },
};

// ============================================================
// ОБЕРТКА ДЛЯ ЛОГИРОВАНИЯ ШАГОВ С АРТЕФАКТАМИ
// ============================================================

/**
 * Обертка для автоматического логирования шагов и сохранения артефактов при ошибках.
 * 
 * @param {Page} page - Экземпляр страницы Playwright (может быть null)
 * @param {string} stepName - Название шага
 * @param {Function} action - Асинхронная функция с логикой
 * @returns {Promise<any>} Результат выполнения action
 */
export async function logStep(page, stepName, action) {
  const startTime = Date.now();
  
  logger.info(`Start step: ${stepName}`);
  
  try {
    const result = await action();
    const duration = Date.now() - startTime;
    
    logger.info(`End step: ${stepName}`, { 
      duration_ms: duration,
      success: true,
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error(`Failed step: ${stepName}`, {
      error: error.message,
      stack: error.stack,
      duration_ms: duration,
      success: false,
    });
    
    // ========== КИЛЛЕР-ФИЧА: Скриншот при ошибке ==========
    if (page && !page.isClosed()) {
      try {
        const screenshotPath = `error-${stepName}-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        
        logger.error('Screenshot saved on error', { 
          path: screenshotPath,
          step: stepName,
        });
        
        console.error(JSON.stringify({
          type: 'artifact',
          artifactType: 'screenshot',
          path: screenshotPath,
          step: stepName,
          timestamp: new Date().toISOString(),
        }));
        
      } catch (screenshotError) {
        logger.error('Failed to take screenshot', { 
          error: screenshotError.message,
          step: stepName,
        });
      }
    }
    // =====================================================
    
    throw error; // Пробрасываем ошибку дальше
  }
}

// ============================================================
// METRICS COLLECTOR (Lightweight)
// ============================================================

const metrics = {
  // In-memory хранилище метрик
  _counters: {},
  _timers: {},
  _gauges: {},

  /**
   * Инкремент счётчика
   * @param {string} name - Имя метрики
   * @param {number} value - Значение (по умолчанию 1)
   */
  increment(name, value = 1) {
    this._counters[name] = (this._counters[name] || 0) + value;
  },

  /**
   * Установка gauge (мгновенное значение)
   * @param {string} name - Имя метрики
   * @param {number} value - Значение
   */
  gauge(name, value) {
    this._gauges[name] = value;
  },

  /**
   * Начало таймера
   * @param {string} name - Имя метрики
   */
  timerStart(name) {
    this._timers[name] = Date.now();
  },

  /**
   * Конец таймера (логирует и записывает)
   * @param {string} name - Имя метрики
   * @returns {number} Длительность в мс
   */
  timerEnd(name) {
    if (!this._timers[name]) {
      logger.warn(`Timer '${name}' was not started`);
      return 0;
    }

    const duration = Date.now() - this._timers[name];
    this.gauge(`${name}_ms`, duration);
    delete this._timers[name];

    return duration;
  },

  /**
   * Получить все метрики
   */
  getAll() {
    return {
      counters: { ...this._counters },
      gauges: { ...this._gauges },
    };
  },

  /**
   * Сброс всех метрик
   */
  reset() {
    this._counters = {};
    this._timers = {};
    this._gauges = {};
  },

  /**
   * Логирование всех метрик в JSON
   */
  logSummary() {
    const data = this.getAll();

    console.error(JSON.stringify({
      type: 'metrics_summary',
      timestamp: new Date().toISOString(),
      service: 'glm-chat-mcp',
      ...data,
    }));

    return data;
  },
};

// ============================================================
// МЕТОД metric() ДЛЯ ЛОГГЕРА
// ============================================================

/**
 * Логирование метрик в потоковом режиме
 * @param {string} name - Имя метрики
 * @param {number} value - Значение
 * @param {object} tags - Теги для группировки
 */
logger.metric = function(name, value, tags = {}) {
  // Записываем в in-memory хранилище
  if (name.includes('_ms') || name.includes('duration') || name.includes('time')) {
    metrics.gauge(name, value);
  } else {
    metrics.increment(name, value);
  }

  // Логируем в stderr как JSON
  console.error(JSON.stringify({
    type: 'metric',
    name,
    value,
    tags,
    timestamp: new Date().toISOString(),
    service: 'glm-chat-mcp',
  }));
};

// ============================================================
// УТИЛИТЫ ЛОГИРОВАНИЯ
// ============================================================

/**
 * Логирование HTML-контента страницы при ошибке
 * @param {Page} page - Экземпляр страницы Playwright
 * @param {string} context - Контекст (название шага, функция и т.д.)
 */
export async function logPageHTML(page, context = 'unknown') {
  if (!page || page.isClosed()) {
    logger.warn('Cannot log HTML: page is closed');
    return;
  }
  
  try {
    const html = await page.content();
    const truncated = html.length > 5000 ? html.substring(0, 5000) + '...[truncated]' : html;
    
    console.error(JSON.stringify({
      type: 'artifact',
      artifactType: 'html',
      context,
      timestamp: new Date().toISOString(),
      html: truncated,
    }));
  } catch (error) {
    logger.error('Failed to log page HTML', { error: error.message });
  }
}

/**
 * Логирование текущего URL страницы
 * @param {Page} page - Экземпляр страницы Playwright
 */
export async function logCurrentURL(page) {
  if (!page || page.isClosed()) {
    logger.warn('Cannot log URL: page is closed');
    return;
  }
  
  try {
    const url = page.url();
    logger.info('Current page URL', { url });
  } catch (error) {
    logger.error('Failed to get page URL', { error: error.message });
  }
}

/**
 * Логирование консольных сообщений страницы
 * @param {Page} page - Экземпляр страницы Playwright
 * @param {string} level - Уровень: 'log', 'warn', 'error'
 */
export async function logConsoleMessages(page, level = 'error') {
  if (!page || page.isClosed()) {
    return;
  }
  
  try {
    const messages = [];
    
    page.on('console', msg => {
      if (msg.type() === level || level === 'all') {
        messages.push({
          type: msg.type(),
          text: msg.text(),
          location: msg.location(),
        });
      }
    });
    
    // Возвращаем функцию очистки
    return () => {
      if (messages.length > 0) {
        console.error(JSON.stringify({
          type: 'artifact',
          artifactType: 'console',
          level,
          messages,
          timestamp: new Date().toISOString(),
        }));
      }
    };
  } catch (error) {
    logger.error('Failed to setup console logging', { error: error.message });
  }
}

// ============================================================
// ЭКСПОРТ
// ============================================================

export default logger;

export { LOG_LEVELS, metrics };
