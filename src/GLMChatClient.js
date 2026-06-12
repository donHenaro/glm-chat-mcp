/**
 * GLMChatClient — Singleton клиент для взаимодействия с GLM Chat (chat.z.ai)
 *
 * Возможности:
 * - Singleton — единый экземпляр для всех tools
 * - Lazy Initialization — браузер запускается только при первом запросе
 * - Полная навигация по chat.z.ai (чаты, история, UUID)
 * - Управление режимами: Agent Mode, Deep Think, Web Search
 * - Отправка и получение файлов
 * - State Transition — ожидание завершения генерации
 */

import logger from './logger.js';
import { logStep } from './logger.js';
import {
  createInputLocator,
  createSendButtonLocator,
  createStopButtonLocator,
  createNewChatButtonLocator,
  createAssistantMessageLocator,
  isStopButtonVisible,
  isActionButtonsVisible,
  SELECTORS,
} from './selectors.js';
import {
  SessionExpiredError,
  NetworkError,
  classifyError,
  checkPageHealth,
  attemptSoftRecovery,
} from './errors.js';
// decisionHeuristics available if needed: import from './utils/decisionHeuristics.js'
import { fileManager } from './utils/fileManager.js';
import { logGLMChat, listGLMChats } from './utils/glmChatLogger.js';

// ============================================================
// КОНФИГУРАЦИЯ
// ============================================================

const CONFIG = {
  CHAT_URL: 'https://chat.z.ai',
  TIMEOUT: {
    NAVIGATION: 30000,
    RESPONSE: 180000,
    ELEMENT: 5000,
    GENERATION_START: 15000,
  },
  RETRY: {
    MAX_ATTEMPTS: 3,
    DELAY_BASE: 2000,
  },

  // Путь к профилю Chrome пользователя (содержит куки и сессии — пользователь уже залогинен)
  // Windows: C:\Users\<USERNAME>\AppData\Local\Google\Chrome\User Data
  // macOS:   /Users/<USERNAME>/Library/Application Support/Google/Chrome
  // Linux:   /home/<USERNAME>/.config/google-chrome
  // Переопределить: env CHROME_USER_DATA_DIR=/path/to/profile
  CHROME_USER_DATA_DIR: process.env.CHROME_USER_DATA_DIR || (() => {
    const os = process.platform;
    const home = process.env.HOME || process.env.USERPROFILE || '';
    if (os === 'win32') return `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data`;
    if (os === 'darwin') return `${home}/Library/Application Support/Google/Chrome`;
    return `${home}/.config/google-chrome`;
  })(),

  // Путь к Chrome (опционально). Переопределить: env CHROME_EXECUTABLE=/path/to/chrome
  CHROME_EXECUTABLE: process.env.CHROME_EXECUTABLE || null,

  // Имя профиля (обычно "Default"). Переопределить: env CHROME_PROFILE=Profile 1
  CHROME_PROFILE: process.env.CHROME_PROFILE || 'Default',

  // CDP порт для подключения к уже запущенному Chrome
  // Запустить Chrome с: --remote-debugging-port=9222
  CDP_PORT: parseInt(process.env.CDP_PORT || '9222', 10),
};

// ============================================================
// SELECTOR NOT FOUND ERROR (Self-Healing)
// ============================================================

class SelectorNotFoundError extends Error {
  constructor(elementKey, attemptedSelectors, pageHtml) {
    super(`SelectorNotFoundError: Could not find element '${elementKey}'`);
    this.name = 'SelectorNotFoundError';
    this.elementKey = elementKey;
    this.attemptedSelectors = attemptedSelectors;
    this.pageHtml = pageHtml;
  }

  toJSON() {
    return {
      error: this.name,
      elementKey: this.elementKey,
      attemptedSelectors: this.attemptedSelectors,
      message: this.message,
      hint: `Update browser_selectors.json: Add new selector for '${this.elementKey}'`,
    };
  }
}

// ============================================================
// GLM CHAT CLIENT (SINGLETON)
// ============================================================

class GLMChatClient {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isActive = false;
    this.lastActivityTime = null;

    logger.info('GLMChatClient instance created (lazy initialization)');
  }

  // ----------------------------------------------------------
  // ИНИЦИАЛИЗАЦИЯ
  // ----------------------------------------------------------

  /**
   * Инициализация браузера (lazy initialization)
   *
   * Стратегия подключения (в порядке приоритета):
   * 1. Внешний browserInstance (передан снаружи)
   * 2. CDP подключение к уже запущенному Chrome (если он запущен с --remote-debugging-port=9222)
   * 3. launchPersistentContext — Chrome с пользовательским профилем (залогиненный)
   *
   * @param {Browser|null} browserInstance - Внешний экземпляр браузера (опционально)
   */
  async init(browserInstance = null) {
    if (this.isActive) {
      logger.debug('Client already initialized, skipping');
      return;
    }

    // Автоочистка tmp/ при старте
    try {
      const deleted = await fileManager.cleanupTempFiles(1); // файлы старше 1 часа
      if (deleted > 0) logger.info(`Cleaned up ${deleted} temp files from previous session`);
    } catch (e) { logger.debug('Temp cleanup skipped:', e.message); }

    logger.info('Initializing GLM Client...');

    try {
      if (browserInstance) {
        // Вариант 1: Внешний браузер передан явно
        this.browser = browserInstance;
        this.context = await this.browser.newContext({ viewport: { width: 1280, height: 720 } });
        this.page = await this.context.newPage();
        logger.info('Using provided browser instance');

      } else {
        const { chromium } = await import('playwright');

        // Вариант 2: Подключение к уже запущенному Chrome через CDP
        // Chrome должен быть запущен с флагом: --remote-debugging-port=9222
        const cdpConnected = await this._tryConnectCDP(chromium);

        if (!cdpConnected) {
          // Вариант 3: launchPersistentContext — использует профиль пользователя (логин сохранён)
          const userDataDir = CONFIG.CHROME_USER_DATA_DIR;
          logger.info(`Launching persistent Chrome with profile: ${userDataDir}`);

          this.context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            channel: 'chrome',    // Использовать установленный Chrome (не Chromium)
            executablePath: CONFIG.CHROME_EXECUTABLE || undefined,
            viewport: { width: 1280, height: 720 },
            args: [
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-blink-features=AutomationControlled', // Скрывает признаки автоматизации
            ],
          });

          // При launchPersistentContext нет отдельного browser объекта
          this.browser = null;
          this.page = this.context.pages()[0] || await this.context.newPage();
          logger.info('Launched Chrome with persistent profile (user should be logged in)');
        }
      }

      this._attachPageListeners(this.page);

      await this.page.goto(CONFIG.CHAT_URL, {
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.TIMEOUT.NAVIGATION,
      });

      await this.page.waitForTimeout(2000);

      // Проверка логина
      const isLoggedIn = await this._checkLogin();
      if (!isLoggedIn) {
        logger.warn('⚠️  User is NOT logged in to chat.z.ai. Manual login required.');
        logger.warn('    Open chat.z.ai in your browser, log in, then restart the skill.');
      } else {
        logger.info('✅ User is logged in to chat.z.ai');
      }

      this.isActive = true;
      this.lastActivityTime = Date.now();

      logger.info('GLM Client initialized successfully', { url: CONFIG.CHAT_URL });

    } catch (error) {
      const classifiedError = classifyError(error, 'init');
      logger.error('Failed to initialize GLM Client', { error: classifiedError.message });
      throw classifiedError;
    }
  }

  /**
   * Попытка подключения к уже запущенному Chrome через CDP
   * Chrome должен быть запущен с: --remote-debugging-port=9222
   * @private
   */
  async _tryConnectCDP(chromium) {
    try {
      logger.info('Trying CDP connection to running Chrome on port 9222...');
      this.browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 3000 });

      const contexts = this.browser.contexts();
      if (contexts.length > 0) {
        this.context = contexts[0];
        const pages = this.context.pages();
        // Ищем уже открытую вкладку с chat.z.ai
        const chatPage = pages.find(p => p.url().includes('chat.z.ai'));
        this.page = chatPage || pages[0] || await this.context.newPage();
      } else {
        this.context = await this.browser.newContext({ viewport: { width: 1280, height: 720 } });
        this.page = await this.context.newPage();
      }

      logger.info('✅ Connected to running Chrome via CDP');
      return true;
    } catch (e) {
      logger.info(`CDP connection failed (Chrome not running with debug port): ${e.message}`);
      this.browser = null;
      this.context = null;
      this.page = null;
      return false;
    }
  }

  /**
   * Проверка что пользователь залогинен на chat.z.ai
   * @private
   */
  async _checkLogin() {
    try {
      const url = this.page.url();
      // Если редирект на /login или /signin — не залогинен
      if (url.includes('/login') || url.includes('/signin') || url.includes('/auth')) {
        return false;
      }
      // Проверяем наличие элементов чата (поле ввода или приветствие)
      const chatVisible = await this.page.locator(
        '#chat-input, textarea, div[contenteditable="true"], [class*="chat-input"]'
      ).isVisible({ timeout: 5000 }).catch(() => false);
      return chatVisible;
    } catch {
      return false;
    }
  }

  /**
   * Навешивает слушатели событий на страницу
   * @private
   */
  _attachPageListeners(page) {
    page.on('pageerror', error => logger.error('Page error', { error: error.message }));
    page.on('console', msg => {
      if (msg.type() === 'error') logger.debug('Console error', { text: msg.text() });
    });
    page.on('download', async (download) => {
      logger.info('GLM file download initiated', { filename: download.suggestedFilename() });
      this._lastDownload = download;
    });
  }

  /**
   * Гарантирует что клиент инициализирован
   * @private
   */
  async _ensureInitialized() {
    if (!this.isActive || !this.page || this.page.isClosed()) {
      await this.init();
    }
  }

  // ----------------------------------------------------------
  // HEALTH CHECK
  // ----------------------------------------------------------

  async ensureConnected() {
    if (!this.page || this.page.isClosed()) {
      logger.warn('Page is closed or missing, re-initializing...');
      this.isActive = false;
      await this.init();
      return;
    }

    try {
      await checkPageHealth(this.page);
    } catch (error) {
      if (error instanceof SessionExpiredError) throw error;
      await attemptSoftRecovery(this.page, error);
    }

    const currentUrl = this.page.url();
    if (!currentUrl.includes('chat.z.ai')) {
      logger.warn('Redirect detected, returning to chat...');
      await this.page.goto(CONFIG.CHAT_URL, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT.NAVIGATION });
    }
  }

  // ----------------------------------------------------------
  // НАВИГАЦИЯ
  // ----------------------------------------------------------

  /**
   * Перейти в существующий чат по UUID
   * @param {string} uuid - UUID чата
   */
  async navigateToChat(uuid) {
    await this._ensureInitialized();
    const url = `${CONFIG.CHAT_URL}/c/${uuid}`;
    logger.info(`Navigating to chat: ${uuid}`);
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT.NAVIGATION });
    await this.page.waitForTimeout(1500);
    return url;
  }

  /**
   * Создание нового чата
   * @param {string} topic - Тема чата (для логирования)
   */
  async startNewChat(topic = '') {
    await this.ensureConnected();

    return await logStep(this.page, 'StartNewChat', async () => {
      try {
        const newChatButton = createNewChatButtonLocator(this.page);
        await newChatButton.click();
        await this.page.waitForTimeout(2000);
      } catch (error) {
        logger.warn('Could not click New Chat button, navigating directly');
        await this.page.goto(CONFIG.CHAT_URL, { waitUntil: 'domcontentloaded' });
      }

      const currentURL = this.page.url();
      await logGLMChat(currentURL, topic);
      logger.info('New chat created');
    });
  }

  /**
   * Поиск чата в боковой панели по тексту
   * @param {string} searchTopic - Текст для поиска
   * @returns {Promise<string|null>} UUID найденного чата или null
   */
  async findChatInSidebar(searchTopic) {
    await this._ensureInitialized();

    try {
      // Попробовать через кнопку поиска
      const searchBtn = this.page.locator(
        'button[aria-label*="search" i], button:has-text("Search"), [data-testid="search"]'
      ).first();

      if (await searchBtn.isVisible({ timeout: 1000 })) {
        await searchBtn.click();
        const searchInput = this.page.locator('input[placeholder*="search" i], input[type="search"]').first();
        await searchInput.fill(searchTopic);
        await searchInput.press('Enter');
        await this.page.waitForTimeout(1000);
      }

      // Искать в списке чатов
      const chatItems = this.page.locator('[class*="chat-item"], [class*="conversation"], [class*="chat-list"] li');
      const count = await chatItems.count();

      for (let i = 0; i < count; i++) {
        const text = await chatItems.nth(i).textContent().catch(() => '');
        if (text.toLowerCase().includes(searchTopic.toLowerCase())) {
          await chatItems.nth(i).click();
          await this.page.waitForTimeout(1000);
          return this.getCurrentUUID();
        }
      }
    } catch (e) {
      logger.debug('findChatInSidebar error:', e.message);
    }

    return null;
  }

  /**
   * Получить текущий UUID чата из URL
   * @returns {string|null}
   */
  getCurrentUUID() {
    const url = this.page?.url() || '';
    const match = url.match(/\/c\/([a-f0-9-]{36})/);
    return match ? match[1] : null;
  }

  // ----------------------------------------------------------
  // УПРАВЛЕНИЕ МОДЕЛЯМИ
  // ----------------------------------------------------------

  /**
   * Переключение модели GLM
   * @param {'GLM-5-Turbo'|'GLM-4.7'|'GLM-5'} targetModel - Целевая модель
   */
  async switchModel(targetModel = 'GLM-5-Turbo') {
    await this._ensureInitialized();

    logger.info(`Switching model to: ${targetModel}`);

    // Проверить модальное окно переключения (может появиться автоматически)
    try {
      const modal = this.page.locator('[role="dialog"], [class*="modal"]').first();
      if (await modal.isVisible({ timeout: 2000 })) {
        const modalBtn = modal.locator(`button:has-text("${targetModel}")`).first();
        if (await modalBtn.isVisible({ timeout: 1000 })) {
          await modalBtn.click();
          await this.page.waitForTimeout(1000);
          logger.info(`Model switched via modal: ${targetModel}`);
          return true;
        }
      }
    } catch { /* нормально */ }

    // Найти переключатель моделей
    const modelSelectors = [
      `button:has-text("${targetModel}")`,
      'button:has-text("GLM-5")',
      '[class*="model-selector"]',
      'button[aria-haspopup="listbox"]',
      'button[aria-label*="model" i]',
      'select[class*="model"]',
    ];

    for (const sel of modelSelectors) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 1000 })) {
          await el.click();
          await this.page.waitForTimeout(500);

          // Выбрать нужную модель из выпадающего
          const modelOption = this.page.locator(`text="${targetModel}", [role="option"]:has-text("${targetModel}")`).first();
          if (await modelOption.isVisible({ timeout: 1000 })) {
            await modelOption.click();
            logger.info(`Model switched: ${targetModel}`);
            return true;
          }
          break;
        }
      } catch { continue; }
    }

    // JavaScript fallback
    const modelEls = await this.page.evaluate((target) => {
      const found = [];
      document.querySelectorAll('button, [role="option"], [role="menuitem"]').forEach(el => {
        if (el.textContent?.includes(target)) {
          found.push({ tag: el.tagName, text: el.textContent.trim().substring(0, 50) });
          el.click();
        }
      });
      return found;
    }, targetModel);

    if (modelEls.length > 0) {
      logger.info(`Model switched via JS: ${targetModel}`);
      return true;
    }

    logger.warn(`Could not find model switcher for: ${targetModel}`);
    return false;
  }

  // ----------------------------------------------------------
  // УПРАВЛЕНИЕ РЕЖИМАМИ
  // ----------------------------------------------------------

  /**
   * Проверяет активен ли режим по ключу кнопки
   * @param {string} buttonKey - Ключ из browser_selectors.json
   * @returns {Promise<boolean>}
   */
  async isModeActive(buttonKey) {
    await this._ensureInitialized();

    try {
      const btn = await this.findElement(buttonKey);

      const ariaPressed = await btn.getAttribute('aria-pressed');
      if (ariaPressed !== null) return ariaPressed === 'true';

      const btnText = await btn.textContent();
      if (btnText?.toLowerCase().includes('enabled')) return true;

      const className = await btn.getAttribute('class') || '';
      return className.includes('active') || className.includes('selected');

    } catch (e) {
      logger.warn(`Cannot check mode state for ${buttonKey}: ${e.message}`);
      return false;
    }
  }

  /**
   * Устанавливает режим GLM
   * @param {'agent'|'deep_think'|'web_search'|'default'} mode
   */
  async setMode(mode) {
    await this._ensureInitialized();

    const needAgent = (mode === 'agent');
    const needDeepThink = (mode === 'deep_think');
    const needWebSearch = (mode === 'web_search');

    const results = { agent: false, deepThink: false, webSearch: false };

    logger.info(`Setting mode to: ${mode}`);

    // Agent Mode
    try {
      const current = await this.isModeActive('agent_mode_button');
      if (current !== needAgent) {
        const btn = await this.findElement('agent_mode_button');
        await btn.click();
        await this.page.waitForTimeout(500);
      }
      results.agent = await this.isModeActive('agent_mode_button');
    } catch (e) {
      logger.warn(`Cannot toggle Agent Mode: ${e.message}`);
    }

    // Deep Think
    try {
      const current = await this.isModeActive('deep_think_button');
      if (current !== needDeepThink) {
        const btn = await this.findElement('deep_think_button');
        await btn.click();
        await this.page.waitForTimeout(500);
      }
      results.deepThink = await this.isModeActive('deep_think_button');
    } catch (e) {
      logger.warn(`Cannot toggle Deep Think: ${e.message}`);
    }

    // Web Search
    if (needWebSearch) {
      results.webSearch = await this.enableWebSearch();
    }

    logger.info(`Mode set: Agent=${results.agent}, DeepThink=${results.deepThink}, WebSearch=${results.webSearch}`);
    return results;
  }

  /**
   * Включает Web Search через меню "+" (основной метод)
   * @returns {Promise<boolean>}
   */
  async enableWebSearch() {
    await this._ensureInitialized();

    logger.info('Enabling Web Search via menu...');

    try {
      // Метод 1: через меню "+"
      const moreBtn = this.page.locator(
        'button[aria-label="More"], button[aria-label="Add"], button[aria-label="Attach"]'
      ).first();

      if (await moreBtn.isVisible({ timeout: 2000 })) {
        await moreBtn.click();
        await this.page.waitForTimeout(500);

        const searchItem = this.page.locator(
          '[role="menuitem"]:has-text("Search"), button:has-text("Search"), li:has-text("Search"), span:has-text("联网搜索")'
        ).first();

        if (await searchItem.isVisible({ timeout: 1000 })) {
          await searchItem.click();
          await this.page.waitForTimeout(500);
          logger.info('Web Search enabled via menu');
          return true;
        }
      }
    } catch (e) {
      logger.debug('Menu method failed, trying direct button:', e.message);
    }

    // Метод 2: прямая кнопка (fallback)
    try {
      const searchBtn = this.page.locator(
        'button[aria-label*="Web Search"], button[aria-label*="联网搜索"], button[aria-label*="Search"]'
      ).first();

      if (await searchBtn.isVisible({ timeout: 1000 })) {
        const ariaPressed = await searchBtn.getAttribute('aria-pressed');
        if (ariaPressed !== 'true') {
          await searchBtn.click();
          await this.page.waitForTimeout(500);
        }
        logger.info('Web Search enabled via direct button');
        return true;
      }
    } catch (e) {
      logger.warn('Web Search enable failed:', e.message);
    }

    return false;
  }

  /**
   * Определяет оптимальный режим по тексту запроса
   * @param {string} query
   * @returns {'web_search'|'agent'|'deep_think'|'default'}
   */
  analyzeQueryForMode(query) {
    const q = query.toLowerCase();

    const webSearchKw = ['актуальн', 'последн', 'версия', 'документация', 'новый api',
      'latest', 'version', 'documentation', 'найди', 'проверь', 'current',
      'maven', 'gradle', 'dependency', 'существуе', 'есть ли', 'is there'];

    const deepThinkKw = ['архитектур', 'проектир', 'рефакторинг', 'сложн', 'анализ',
      'architect', 'refactor', 'design', 'complex', 'паттерн', 'pattern',
      'saga', 'cqrs', 'микросервис', 'оптимиз', 'performance'];

    const agentKw = ['сгенерируй', 'создай', 'код', 'implement', 'generate', 'create', 'write code'];

    if (webSearchKw.some(kw => q.includes(kw))) return 'web_search';
    if (deepThinkKw.some(kw => q.includes(kw))) return 'deep_think';
    if (agentKw.some(kw => q.includes(kw))) return 'agent';
    return 'default';
  }

  // ----------------------------------------------------------
  // ОТПРАВКА СООБЩЕНИЙ
  // ----------------------------------------------------------

  /**
   * Отправка сообщения в GLM
   *
   * @param {string} message - Текст сообщения
   * @param {object} options
   * @param {boolean} options.deepThink - Включить Deep Think
   * @param {boolean} options.webSearch - Включить Web Search
   * @param {boolean} options.agentMode - Включить Agent Mode
   * @param {string} options.mode - Авто-режим: 'auto'|'agent'|'deep_think'|'web_search'|'default'
   * @param {Array<string>} options.attachments - Пути к файлам
   * @param {number} options.timeout - Таймаут ожидания ответа (мс)
   * @returns {Promise<string>} Текст ответа GLM
   */
  async sendMessage(message, options = {}) {
    await this.ensureConnected();
    this.lastActivityTime = Date.now();

    const {
      deepThink = false,
      webSearch = false,
      agentMode = false,
      mode = 'auto',
      attachments = [],
      timeout = CONFIG.TIMEOUT.RESPONSE,
    } = options;

    // Авто-определение режима
    const effectiveMode = mode === 'auto' ? this.analyzeQueryForMode(message) : mode;

    logger.info('Sending message', {
      mode: effectiveMode,
      deepThink,
      webSearch,
      attachments: attachments.length,
    });

    return await logStep(this.page, 'sendMessage', async () => {
      // 1. Установить режим
      if (effectiveMode !== 'default') {
        await this.setMode(effectiveMode);
      } else {
        if (agentMode) await this.setMode('agent');
        if (deepThink) await this.setMode('deep_think');
        if (webSearch) await this.enableWebSearch();
      }

      // 2. Прикрепить файлы (если нужно)
      if (attachments.length > 0) {
        await this.attachFiles(attachments);
      }

      // 3. Ввод текста
      await logStep(this.page, 'Input_Text', async () => {
        // JavaScript inject — надёжно для React/Vue
        await this.page.evaluate((msg) => {
          const el = document.querySelector('#chat-input') || document.querySelector('textarea');
          if (el) {
            el.focus();
            el.value = msg;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, message);

        await this.page.waitForTimeout(500);
      });

      // 4. Отправка
      await logStep(this.page, 'Click_Send', async () => {
        const sendButton = createSendButtonLocator(this.page);
        await sendButton.click();
      });

      // 5. Ожидание ответа
      await this.waitForGLMResponse({ timeout });

      // 6. Получить и записать UUID
      const uuid = this.getCurrentUUID();
      if (uuid) {
        await logGLMChat(this.page.url(), message.substring(0, 80));
        logger.info(`Chat UUID: ${uuid}`);
      }

      // 7. Получить ответ
      return await this.getLastResponse();
    });
  }

  // ----------------------------------------------------------
  // ФАЙЛЫ
  // ----------------------------------------------------------

  /**
   * Прикрепление файлов к сообщению
   * @param {Array<string>} filePaths - Пути к файлам
   * @param {object} options
   * @param {boolean} options.autoConvert - Автоконвертация .java/.js → .txt
   */
  async attachFiles(filePaths, options = {}) {
    const { autoConvert = true } = options;

    return await logStep(this.page, 'AttachFiles', async () => {
      const UNSUPPORTED = ['.java', '.js', '.ts', '.kt', '.scala', '.go', '.rs', '.cpp', '.c', '.cs'];
      const processedPaths = [];

      for (const fp of filePaths) {
        const ext = fp.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
        if (autoConvert && UNSUPPORTED.includes(ext)) {
          const staged = await fileManager.stageFile(fp, { convert: true });
          const convertedPath = staged.converted || staged.path || fp;
          processedPaths.push(convertedPath);
          logger.info(`Converting: ${fp} → ${convertedPath}`);
        } else {
          processedPaths.push(fp);
        }
      }

      // Метод 1: через меню "+"
      try {
        const moreBtn = this.page.locator(
          'button[aria-label="More"], button[aria-label="Add"], button[aria-label="Attach"]'
        ).first();

        if (await moreBtn.isVisible({ timeout: 2000 })) {
          await moreBtn.click();
          await this.page.waitForTimeout(500);

          const uploadItem = this.page.locator(
            'button:has-text("Upload"), [role="menuitem"]:has-text("Upload"), li:has-text("Upload")'
          ).first();

          if (await uploadItem.isVisible({ timeout: 1000 })) {
            await uploadItem.click();
          }
        }
      } catch { /* нормально */ }

      // Заполнить file input
      const fileInput = this.page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(processedPaths);

      logger.info(`Attached ${processedPaths.length} file(s)`);
      return processedPaths;
    });
  }

  /**
   * Ожидание и получение файла загруженного GLM
   * @param {string} saveDir - Директория для сохранения
   * @param {number} timeout - Таймаут ожидания (мс)
   * @returns {Promise<string|null>} Путь к сохранённому файлу
   */
  async receiveFile(saveDir = './downloads', timeout = 30000) {
    await this._ensureInitialized();

    logger.info('Waiting for file download from GLM...');

    // Проверить наличие кнопки загрузки в ответе
    try {
      const downloadBtn = this.page.locator(
        'a[download], button:has-text("Download"), a[href*="/download"], button[aria-label*="download" i]'
      ).first();

      if (await downloadBtn.isVisible({ timeout: 5000 })) {
        const [download] = await Promise.all([
          this.page.waitForEvent('download', { timeout }),
          downloadBtn.click(),
        ]);

        const fs = await import('fs');
        fs.mkdirSync(saveDir, { recursive: true });
        const savePath = `${saveDir}/${download.suggestedFilename()}`;
        await download.saveAs(savePath);
        logger.info(`File saved: ${savePath}`);
        return savePath;
      }
    } catch (e) {
      logger.warn('receiveFile error:', e.message);
    }

    return null;
  }

  // ----------------------------------------------------------
  // ОЖИДАНИЕ И ПОЛУЧЕНИЕ ОТВЕТА
  // ----------------------------------------------------------

  /**
   * Полный алгоритм ожидания ответа GLM
   * Учитывает: Stop button, thinking indicator, networkidle
   */
  async waitForGLMResponse(options = {}) {
    const { timeout = CONFIG.TIMEOUT.RESPONSE } = options;

    return await logStep(this.page, 'WaitForGLMResponse', async () => {
      // Шаг 1: Ждём появления Stop button (генерация началась)
      try {
        await this.page.waitForFunction(
          () => {
            const stop = document.querySelector('button[aria-label*="Stop" i]')
                      || document.querySelector('button:has-text("Stop")');
            return stop && stop.offsetParent !== null;
          },
          { timeout: CONFIG.TIMEOUT.GENERATION_START }
        );
        logger.debug('Generation started (Stop visible)');
      } catch {
        logger.debug('Stop button not found within timeout (fast response?)');
      }

      // Шаг 2: Ждём исчезновения Stop + thinking индикатора
      await this.page.waitForFunction(
        () => {
          const stop = document.querySelector('button[aria-label*="Stop" i]')
                    || document.querySelector('button:has-text("Stop")');
          const thinking = document.querySelector('[class*="thinking"]');
          const stopGone = !stop || stop.offsetParent === null;
          const thinkingGone = !thinking || thinking.offsetParent === null;
          return stopGone && thinkingGone;
        },
        { timeout }
      );
      logger.debug('Generation completed (Stop hidden, thinking gone)');

      // Шаг 3: Ждём кнопок действий (Copy/Regenerate) — UI готов
      try {
        await this.page.waitForFunction(
          () => {
            const btn = document.querySelector('button:has-text("Copy")')
                     || document.querySelector('button:has-text("Regenerate")');
            return btn && btn.offsetParent !== null;
          },
          { timeout: 5000 }
        );
      } catch { /* нормально */ }

      // Шаг 4: Network idle
      try {
        await this.page.waitForLoadState('networkidle', { timeout: 3000 });
      } catch {
        await this.page.waitForTimeout(300);
      }

      logger.info('GLM response ready');
    });
  }

  /**
   * Получение текста последнего ответа GLM
   * @returns {Promise<string>}
   */
  async getLastResponse() {
    return await logStep(this.page, 'GetLastResponse', async () => {
      const selectors = [
        '.message.assistant:last-child',
        '.assistant-response:last-child',
        '[class*="assistant"]:last-child',
        '.markdown-content:last-child',
      ];

      for (const sel of selectors) {
        try {
          const el = this.page.locator(sel).last();
          if (await el.isVisible({ timeout: 1000 })) {
            const text = await el.innerText();
            if (text && text.length > 10) return text;
          }
        } catch { continue; }
      }

      // Fallback
      const text = await this.page.locator('[class*="message"]').last()
        .innerText({ timeout: CONFIG.TIMEOUT.ELEMENT })
        .catch(() => '');

      if (!text || text.length < 10) {
        logger.warn('Response text is empty or too short');
      }

      return text;
    });
  }

  /**
   * Извлечение блоков кода из ответа
   * @returns {Promise<Array<{language: string, code: string}>>}
   */
  async extractCodeBlocks() {
    return await this.page.evaluate(() => {
      const blocks = document.querySelectorAll(
        'pre code, [class*="code-block"] pre, [class*="language-"]'
      );
      return Array.from(blocks).map(b => ({
        language: b.className.match(/language-(\w+)/)?.[1] || 'unknown',
        code: b.textContent || '',
      }));
    });
  }

  // ----------------------------------------------------------
  // SELECTOR MEMORY
  // ----------------------------------------------------------

  /**
   * Поиск элемента по ключу с поддержкой Fallback
   * @param {string} elementKey - Ключ из browser_selectors.json
   * @returns {Promise<Locator>}
   */
  async findElement(elementKey) {
    if (!this.page) throw new Error('Client not initialized. Call init() first.');

    let selectorsMap = null;
    try {
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      const config = require('./config/browser_selectors.json');
      selectorsMap = config.elements;
    } catch {
      logger.warn('Could not load browser_selectors.json, using legacy selectors');
    }

    if (!selectorsMap || !selectorsMap[elementKey]) {
      return this._getLegacyLocator(elementKey);
    }

    const selectors = selectorsMap[elementKey].selectors;

    for (let i = 0; i < selectors.length; i++) {
      try {
        const locator = this.page.locator(selectors[i]);
        if (await locator.count() > 0) {
          logger.debug(`Found '${elementKey}' with selector #${i + 1}`);
          return locator;
        }
      } catch { continue; }
    }

    throw new SelectorNotFoundError(elementKey, selectors, await this.page.content());
  }

  /**
   * @private
   */
  _getLegacyLocator(elementKey) {
    switch (elementKey) {
      case 'chat_input': return createInputLocator(this.page);
      case 'send_button': return createSendButtonLocator(this.page);
      case 'stop_button': return createStopButtonLocator(this.page);
      case 'response_container': return createAssistantMessageLocator(this.page);
      default: throw new Error(`Unknown element key: ${elementKey}`);
    }
  }

  // ----------------------------------------------------------
  // УТИЛИТЫ
  // ----------------------------------------------------------

  /**
   * Проверка и установка фокуса на элементе
   * @param {Locator} locator
   */
  async ensureFocus(locator) {
    try {
      await locator.focus();
      await this.page.waitForTimeout(50);

      const isFocused = await locator.evaluate(el => document.activeElement === el);
      if (!isFocused) {
        await locator.click();
        await this.page.waitForTimeout(50);
      }
      return true;
    } catch (error) {
      logger.error('Error establishing focus', { error: error.message });
      return false;
    }
  }

  /**
   * Статистика клиента
   */
  getStats() {
    return {
      isActive: this.isActive,
      lastActivityTime: this.lastActivityTime,
      url: this.page?.url() || null,
      uuid: this.getCurrentUUID(),
    };
  }

  /**
   * Graceful Shutdown
   * @param {object} options
   * @param {boolean} options.closeBrowser - Закрыть браузер (по умолчанию: false)
   */
  async disconnect(options = {}) {
    const { closeBrowser = false } = options;

    logger.info('GLM Client disconnect requested', { closeBrowser });

    try {
      if (closeBrowser) {
        // launchPersistentContext: закрываем context (нет отдельного browser)
        if (this.browser === null && this.context) {
          await this.context.close();
          logger.info('Persistent context closed');
        } else if (this.browser?.isConnected()) {
          await this.browser.close();
          logger.info('Browser closed');
        }
      } else {
        logger.info('Browser kept open for continued dialog');
      }
    } catch (error) {
      logger.error('Error during disconnect', { error: error.message });
    } finally {
      if (closeBrowser) {
        await fileManager.cleanupTempFiles(0).catch(() => {});
        this.isActive = false;
        this.page = null;
        this.context = null;
        this.browser = null;
      }
    }
  }
}

// ============================================================
// SINGLETON EXPORT
// ============================================================

export { SelectorNotFoundError };
export const glmClient = new GLMChatClient();
export default glmClient;
