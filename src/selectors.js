/**
 * Unified Selectors System for GLM Chat MCP
 * 
 * Использует семантические локаторы с приоритетом:
 * 1. ARIA атрибуты (доступность)
 * 2. Placeholder text (надежность)
 * 3. ID (уникальность)
 * 4. Fallback к классам
 */

// ============================================================
// БАЗОВЫЕ СЕЛЕКТОРЫ
// ============================================================

const BASE_SELECTORS = {
  // Текстовое поле ввода сообщения
  INPUT: [
    '#chat-input',                                    // ID (приоритет)
    'textarea[placeholder*="Send"][placeholder*="Message"]',  // Placeholder EN
    'textarea[placeholder*="сообщение"]',             // Placeholder RU
    'textarea[placeholder*="输入"]',                  // Placeholder CN
    'div[contenteditable="true"]',                    // ContentEditable
    'textarea',                                       // Fallback
  ],
  
  // Кнопка отправки сообщения
  SEND_BUTTON: [
    'button[type="submit"]',                          // Type attribute
    '#send-message-button',                           // ID
    'button[aria-label*="send" i]',                   // ARIA
    'button[aria-label*="отправ" i]',                 // ARIA RU
    'button:has(svg.send-icon)',                      // SVG icon
    '.flex.justify-center.items-center button',       // Class pattern
    'button:has(svg)',                                // Any SVG (fallback)
  ],
  
  // Кнопка остановки генерации
  STOP_BUTTON: [
    'button[aria-label*="Stop" i]',                  // ARIA
    'button:has-text("Stop")',                        // Text
    'button:has-text("Остановить")',                  // Text RU
    '[class*="stop-button"]',                         // Class
  ],
  
  // Кнопки нового чата (мультиязычность)
  NEW_CHAT_BUTTON: [
    'button:has-text("New Chat")',                    // EN
    'button:has-text("新对话")',                       // CN
    'button[aria-label*="New Chat" i]',               // ARIA EN
    'button[aria-label*="新对话"]',                    // ARIA CN
    '[class*="new-chat"]',                            // Class
  ],
  
  // Область последнего сообщения ассистента
  ASSISTANT_MESSAGE: [
    '.message.assistant:last-child',                   // Class pattern
    '.assistant-response:last-child',                  // Class pattern
    '[class*="assistant"]:last-child',                // Class contains
    '[class*="response"]:last-child',                 // Class contains
    '.flex.flex-col.gap-2 > div:last-child',          // Flex pattern
  ],
  
  // Кнопки действий после завершения генерации
  ACTION_BUTTONS: [
    'button:has-text("Copy")',                        // Copy
    'button:has-text("Regenerate")',                  // Regenerate
    'button:has-text("Копировать")',                  // RU
    '[class*="copy-button"]',                         // Class
    '[class*="regenerate-button"]',                   // Class
  ],
};

// ============================================================
// ПРОСТЫЕ CSS СЕЛЕКТОРЫ (для querySelector/click)
// ============================================================

/**
 * Простые CSS селекторы для Web Search, Deep Think и других элементов
 * Используются когда не нужен Playwright Locator
 */
export const SELECTORS = {
  // Web Search (глобус) - кнопка с SVG глобусом
  WEB_SEARCH_BUTTON: 'button:has(svg path[d^="M6 2V14"])',

  // Deep Think toggle
  DEEP_THINK_TOGGLE: 'button[data-autothink]',

  // Чат
  CHAT_INPUT: 'textarea',
  SEND_BUTTON: 'button[type="submit"]',
};

// ============================================================
// ФУНКЦИИ-ФАБРИКИ ЛОКАТОРОВ (для Playwright)
// ============================================================

/**
 * Создает локатор для поля ввода с автопоиском
 * @param {Page} page - Экземпляр страницы Playwright
 * @returns {Locator} Playwright Locator
 */
function createInputLocator(page) {
  for (const selector of BASE_SELECTORS.INPUT) {
    try {
      const locator = page.locator(selector).first();
      if (locator) {
        return locator;
      }
    } catch {
      continue;
    }
  }
  throw new Error('INPUT: Не удалось найти поле ввода сообщения');
}

/**
 * Создает локатор для кнопки отправки с автопоиском
 * @param {Page} page - Экземпляр страницы Playwright
 * @returns {Locator} Playwright Locator
 */
function createSendButtonLocator(page) {
  for (const selector of BASE_SELECTORS.SEND_BUTTON) {
    try {
      const locator = page.locator(selector).first();
      if (locator && locator.isVisible()) {
        return locator;
      }
    } catch {
      continue;
    }
  }
  throw new Error('SEND_BUTTON: Не удалось найти кнопку отправки');
}

/**
 * Создает локатор для кнопки Stop с автопоиском
 * @param {Page} page - Экземпляр страницы Playwright
 * @returns {Locator} Playwright Locator
 */
function createStopButtonLocator(page) {
  for (const selector of BASE_SELECTORS.STOP_BUTTON) {
    try {
      const locator = page.locator(selector).first();
      if (locator) {
        return locator;
      }
    } catch {
      continue;
    }
  }
  // Кнопка Stop может отсутствовать - это нормально
  return page.locator('body'); // Dummy locator
}

/**
 * Создает локатор для кнопки нового чата с автопоиском
 * @param {Page} page - Экземпляр страницы Playwright
 * @returns {Locator} Playwright Locator
 */
function createNewChatButtonLocator(page) {
  for (const selector of BASE_SELECTORS.NEW_CHAT_BUTTON) {
    try {
      const locator = page.locator(selector).first();
      if (locator && locator.isVisible()) {
        return locator;
      }
    } catch {
      continue;
    }
  }
  throw new Error('NEW_CHAT_BUTTON: Не удалось найти кнопку нового чата');
}

/**
 * Создает локатор для последнего сообщения ассистента
 * @param {Page} page - Экземпляр страницы Playwright
 * @returns {Locator} Playwright Locator
 */
function createAssistantMessageLocator(page) {
  for (const selector of BASE_SELECTORS.ASSISTANT_MESSAGE) {
    try {
      const locator = page.locator(selector).first();
      if (locator) {
        return locator;
      }
    } catch {
      continue;
    }
  }
  // Fallback: ищем любой текстовый контент ассистента
  return page.locator('[class*="message"]').last();
}

/**
 * Создает локатор для кнопок действий (Copy, Regenerate)
 * @param {Page} page - Экземпляр страницы Playwright
 * @param {string} action - Действие: 'copy' | 'regenerate'
 * @returns {Locator} Playwright Locator
 */
function createActionButtonLocator(page, action = 'copy') {
  const actionSelectors = {
    copy: [
      'button:has-text("Copy")',
      'button:has-text("Копировать")',
      '[class*="copy"]',
    ],
    regenerate: [
      'button:has-text("Regenerate")',
      '[class*="regenerate"]',
    ],
  };
  
  const selectors = actionSelectors[action] || actionSelectors.copy;
  
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if (locator && locator.isVisible()) {
        return locator;
      }
    } catch {
      continue;
    }
  }
  return page.locator('body'); // Dummy locator
}

// ============================================================
// ПРОВЕРОЧНЫЕ ФУНКЦИИ
// ============================================================

/**
 * Проверяет, видна ли кнопка Stop
 * @param {Page} page - Экземпляр страницы Playwright
 * @returns {Promise<boolean>}
 */
async function isStopButtonVisible(page) {
  for (const selector of BASE_SELECTORS.STOP_BUTTON) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.isVisible()) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

/**
 * Проверяет, видна ли кнопка отправки
 * @param {Page} page - Экземпляр страницы Playwright
 * @returns {Promise<boolean>}
 */
async function isSendButtonVisible(page) {
  for (const selector of BASE_SELECTORS.SEND_BUTTON) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.isVisible() && !(await locator.isDisabled())) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

/**
 * Проверяет, появились ли кнопки действий (Copy, Regenerate)
 * @param {Page} page - Экземпляр страницы Playwright
 * @returns {Promise<boolean>}
 */
async function isActionButtonsVisible(page) {
  for (const selector of BASE_SELECTORS.ACTION_BUTTONS) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.isVisible()) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

// ============================================================
// ЭКСПОРТ
// ============================================================

export {
  BASE_SELECTORS,
  createInputLocator,
  createSendButtonLocator,
  createStopButtonLocator,
  createNewChatButtonLocator,
  createAssistantMessageLocator,
  createActionButtonLocator,
  isStopButtonVisible,
  isSendButtonVisible,
  isActionButtonsVisible,
};

export default {
  INPUT: createInputLocator,
  SEND_BUTTON: createSendButtonLocator,
  STOP_BUTTON: createStopButtonLocator,
  NEW_CHAT_BUTTON: createNewChatButtonLocator,
  ASSISTANT_MESSAGE: createAssistantMessageLocator,
  ACTION_BUTTONS: createActionButtonLocator,
  isStopButtonVisible,
  isSendButtonVisible,
  isActionButtonsVisible,
  SELECTORS,
};
