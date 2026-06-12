/**
 * Кастомные ошибки для GLM Chat MCP
 * 
 * Особенности:
 * - Классификация ошибок: Transient, State, Critical
 * - Soft Recovery — восстановление без page.reload()
 * - Детальные сообщения для диагностики
 */

import logger from './logger.js';
import { isStopButtonVisible, isActionButtonsVisible } from './selectors.js';

// ============================================================
// ТИПЫ ОШИБОК
// ============================================================

/**
 * Базовый класс для всех ошибок MCP
 */
export class MCPError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MCPError';
    this.retryable = options.retryable ?? false;
    this.recoverable = options.recoverable ?? true;
    this.context = options.context ?? {};
  }
}

/**
 * Ошибка истекшей сессии (логин требуется)
 * ФАТАЛЬНАЯ — не ретраить, сообщить пользователю
 */
export class SessionExpiredError extends MCPError {
  constructor(message = 'Сессия истекла. Требуется повторный вход.') {
    super(message, {
      retryable: false,
      recoverable: false,
      context: { type: 'session_expired' },
    });
    this.name = 'SessionExpiredError';
  }
}

/**
 * Ошибка сети (транзиентная)
 * РЕТРАИБЕЛЬНАЯ — можно попробовать повторить
 */
export class NetworkError extends MCPError {
  constructor(message = 'Ошибка сети', originalError = null) {
    super(message, {
      retryable: true,
      recoverable: true,
      context: { 
        type: 'network',
        originalError: originalError?.message || null,
      },
    });
    this.name = 'NetworkError';
  }
}

/**
 * Ошибка таймаута
 * РЕТРАИБЕЛЬНАЯ — можно попробовать повторить
 */
export class TimeoutError extends MCPError {
  constructor(message = 'Превышен таймаут', timeoutMs = 0) {
    super(message, {
      retryable: true,
      recoverable: true,
      context: { 
        type: 'timeout',
        timeoutMs,
      },
    });
    this.name = 'TimeoutError';
  }
}

/**
 * Ошибка поиска элемента
 * РЕТРАИБЕЛЬНАЯ — можно попробовать повторить
 */
export class ElementNotFoundError extends MCPError {
  constructor(message = 'Элемент не найден', selector = '') {
    super(message, {
      retryable: true,
      recoverable: true,
      context: { 
        type: 'element_not_found',
        selector,
      },
    });
    this.name = 'ElementNotFoundError';
  }
}

/**
 * Ошибка UI (структура страницы изменилась)
 * МОЖЕТ БЫТЬ РЕТРАИБЕЛЬНОЙ — в зависимости от ситуации
 */
export class UIChangedError extends MCPError {
  constructor(message = 'Структура UI изменилась', details = {}) {
    super(message, {
      retryable: true,
      recoverable: true,
      context: { 
        type: 'ui_changed',
        ...details,
      },
    });
    this.name = 'UIChangedError';
  }
}

/**
 * Критическая ошибка браузера
 * НЕ РЕТРАИБЕЛЬНАЯ — требуется перезапуск браузера
 */
export class BrowserCrashedError extends MCPError {
  constructor(message = 'Браузер завершил работу', originalError = null) {
    super(message, {
      retryable: false,
      recoverable: false,
      context: { 
        type: 'browser_crashed',
        originalError: originalError?.message || null,
      },
    });
    this.name = 'BrowserCrashedError';
  }
}

/**
 * Ошибка недоступности сервиса GLM (HTTP 500)
 * РЕТРАИБЕЛЬНАЯ — сервис временно недоступен
 */
export class GLMServiceUnavailableError extends MCPError {
  constructor(message = 'GLM временно недоступен', retryAfter = 30) {
    super(message, {
      retryable: true,
      recoverable: true,
      context: {
        type: 'service_unavailable',
        status: 500,
        retryAfter,
        // Китайское сообщение из UI GLM
        chineseMessage: '服务暂时不可用,请稍后再试',
      },
    });
    this.name = 'GLMServiceUnavailableError';
    this.status = 500;
    this.retryAfter = retryAfter;
  }
}

// ============================================================
// ФАБРИКА ОШИБОК
// ============================================================

/**
 * Классифицирует ошибку Playwright и возвращает соответствующий тип
 * @param {Error} error - Оригинальная ошибка
 * @param {string} context - Контекст (название функции, шаг)
 * @returns {MCPError} Классифицированная ошибка
 */
export function classifyError(error, context = 'unknown') {
  const errorMessage = error.message?.toLowerCase() || '';
  const errorName = error.name || '';
  
  // Проверяем на истекшую сессию
  if (
    errorMessage.includes('login') ||
    errorMessage.includes('logged out') ||
    errorMessage.includes('session') ||
    errorMessage.includes('войти') ||
    errorMessage.includes('авториз')
  ) {
    logger.warn('Session expired detected', { context, error: error.message });
    return new SessionExpiredError(`Сессия истекла: ${error.message}`);
  }
  
  // Проверяем на ошибки сети
  if (
    errorMessage.includes('net::err') ||
    errorMessage.includes('network') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('сеть') ||
    errorMessage.includes('соединение')
  ) {
    logger.warn('Network error detected', { context, error: error.message });
    return new NetworkError(`Ошибка сети: ${error.message}`, error);
  }
  
  // Проверяем на таймаут
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('timed out') ||
    errorName === 'TimeoutError'
  ) {
    logger.warn('Timeout error detected', { context, error: error.message });
    return new TimeoutError(`Таймаут: ${error.message}`);
  }
  
  // Проверяем на ошибки поиска элемента
  if (
    errorMessage.includes('element') &&
    (errorMessage.includes('not found') ||
     errorMessage.includes('not visible') ||
     errorMessage.includes('not displayed'))
  ) {
    logger.warn('Element not found detected', { context, error: error.message });
    return new ElementNotFoundError(`Элемент не найден: ${error.message}`);
  }
  
  // Проверяем на падение браузера
  if (
    errorMessage.includes('crash') ||
    errorMessage.includes('closed') ||
    errorMessage.includes('disconnected') ||
    errorMessage.includes('Target page')
  ) {
    logger.error('Browser crashed detected', { context, error: error.message });
    return new BrowserCrashedError(`Браузер упал: ${error.message}`, error);
  }
  
  // Проверяем на ошибку 500 / service unavailable
  if (
    errorMessage.includes('500') ||
    errorMessage.includes('service unavailable') ||
    errorMessage.includes('服务暂时不可用') ||
    errorMessage.includes('temporary unavailable')
  ) {
    logger.warn('GLM Service Unavailable (500) detected', { context, error: error.message });
    return new GLMServiceUnavailableError(`Сервис GLM недоступен: ${error.message}`);
  }

  // По умолчанию — общая ошибка
  logger.error('Unknown error classified as generic', { context, error: error.message });
  return new MCPError(`Ошибка: ${error.message}`, {
    context: { originalError: error.message, context },
  });
}

// ============================================================
// ПРОВЕРКА ЗДОРОВЬЯ СТРАНИЦЫ
// ============================================================

/**
 * Проверяет здоровье страницы перед действием
 * @param {Page} page - Экземпляр страницы Playwright
 * @throws {SessionExpiredError} Если сессия истекла
 * @throws {NetworkError} Если обнаружена ошибка сети
 */
export async function checkPageHealth(page) {
  // Проверяем, не выскочило ли окно логина
  const loginPatterns = [
    'button:has-text("Log in")',
    'button:has-text("Sign in")',
    'button:has-text("Войти")',
    'button:has-text("Вход")',
    'a:has-text("Log in")',
  ];
  
  for (const pattern of loginPatterns) {
    try {
      const loginButton = await page.locator(pattern).first().isVisible().catch(() => false);
      if (loginButton) {
        throw new SessionExpiredError();
      }
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        throw error;
      }
      continue;
    }
  }
  
  // Проверяем, нет ли глобальной ошибки сети в интерфейсе
  const networkErrorPatterns = [
    '.network-error',
    '.toast-error',
    '[class*="network-error"]',
    '[class*="connection-error"]',
  ];
  
  for (const pattern of networkErrorPatterns) {
    try {
      const networkError = await page.locator(pattern).first().isVisible().catch(() => false);
      if (networkError) {
        throw new NetworkError('Обнаружена ошибка сети в интерфейсе');
      }
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      continue;
    }
  }
}

// ============================================================
// SOFT RECOVERY
// ============================================================

/**
 * Пытается восстановить состояние без перезагрузки страницы
 * @param {Page} page - Экземпляр страницы Playwright
 * @param {MCPError} error - Ошибка, вызвавшая необходимость восстановления
 * @returns {Promise<boolean>} true если восстановление успешно
 */
export async function attemptSoftRecovery(page, error) {
  logger.info('Attempting soft recovery', { 
    errorType: error.name, 
    errorMessage: error.message,
  });
  
  // Если ошибка фатальная — не восстанавливаем
  if (!error.recoverable) {
    logger.warn('Error is not recoverable, skipping soft recovery');
    return false;
  }
  
  try {
    // 1. Проверяем здоровье страницы
    await checkPageHealth(page);
    
    // 2. Если застряли в состоянии генерации, пытаемся нажать Stop
    if (await isStopButtonVisible(page)) {
      logger.info('Stopping ongoing generation...');
      const stopLocator = page.locator('button:has-text("Stop")').first();
      await stopLocator.click().catch(() => {});
      await page.waitForTimeout(1000);
    }
    
    // 3. Проверяем, восстановился ли нормальный UI
    await checkPageHealth(page);
    
    // 4. Ждем стабильности сети (экспоненциальная задержка)
    await page.waitForTimeout(2000);
    
    logger.info('Soft recovery successful');
    return true;
    
  } catch (recoveryError) {
    logger.error('Soft recovery failed', { 
      error: recoveryError.message,
    });
    return false;
  }
}

// ============================================================
// УТИЛИТЫ
// ============================================================

/**
 * Пауза на указанное количество миллисекунд
 * @param {number} ms - Время в миллисекундах
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Проверка, можно ли повторить операцию
 * @param {Error|MCPError} error - Ошибка
 * @returns {boolean}
 */
export function isRetryable(error) {
  // MCPError с флагом retryable
  if (error instanceof MCPError) {
    return error.retryable;
  }

  // HTTP 5xx ошибки
  if (error.status >= 500) {
    return true;
  }

  // Network errors
  const message = (error.message || '').toLowerCase();
  if (
    message.includes('net::err') ||
    message.includes('econnreset') ||
    message.includes('timeout') ||
    message.includes('temporary unavailable') ||
    message.includes('服务暂时不可用')
  ) {
    return true;
  }

  return false;
}

/**
 * Конфигурация retry по умолчанию
 */
export const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

/**
 * Выполнение функции с retry и экспоненциальным backoff
 * @template T
 * @param {Function} fn - Асинхронная функция для выполнения
 * @param {Object} config - Конфигурация retry
 * @param {number} config.maxRetries - Максимум попыток
 * @param {number} config.baseDelayMs - Базовая задержка
 * @param {number} config.maxDelayMs - Максимальная задержка
 * @param {string} context - Контекст для логирования
 * @returns {Promise<T>} Результат выполнения
 */
export async function withRetry(fn, config = DEFAULT_RETRY_CONFIG, context = 'operation') {
  let lastError;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Проверяем, можно ли повторить
      if (!isRetryable(error)) {
        logger.error('Non-retryable error', {
          context,
          attempt,
          error: error.message,
        });
        throw error;
      }

      // Это последняя попытка?
      if (attempt >= config.maxRetries) {
        logger.error('Max retries exceeded', {
          context,
          attempts: attempt,
          error: error.message,
        });
        break;
      }

      // Вычисляем задержку с экспоненциальным backoff
      const delay = Math.min(
        config.baseDelayMs * Math.pow(2, attempt),
        config.maxDelayMs
      );

      logger.warn(`Retry ${attempt + 1}/${config.maxRetries} in ${delay}ms`, {
        context,
        error: error.message,
        delayMs: delay,
        nextAttempt: attempt + 1,
      });

      await sleep(delay);
    }
  }

  throw lastError;
}

// ============================================================
// ЭКСПОРТ
// ============================================================

export default {
  MCPError,
  SessionExpiredError,
  NetworkError,
  TimeoutError,
  ElementNotFoundError,
  UIChangedError,
  BrowserCrashedError,
  GLMServiceUnavailableError,
  classifyError,
  checkPageHealth,
  attemptSoftRecovery,
  // Новые экспорты
  sleep,
  isRetryable,
  withRetry,
  DEFAULT_RETRY_CONFIG,
};
