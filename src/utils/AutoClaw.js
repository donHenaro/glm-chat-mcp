/**
 * AutoClaw — Автоматический захват и анализ UI/изображений
 * 
 * Возможности:
 * 1. Скриншоты страниц и элементов
 * 2. Анализ DOM-элементов
 * 3. Извлечение текста и данных
 * 4. Детектирование UI компонентов
 * 
 * @version v1.0.0
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class AutoClaw {
  constructor(page) {
    this.page = page;
    this.screenshotDir = path.join(__dirname, '..', 'screenshots');
  }

  /**
   * Инициализация AutoClaw
   */
  async init() {
    await this.ensureScreenshotDir();
    console.log('[AutoClaw] Инициализирован');
  }

  /**
   * Гарантирует наличие директории для скриншотов
   */
  async ensureScreenshotDir() {
    try {
      await fs.mkdir(this.screenshotDir, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }

  /**
   * Захват полного скриншота страницы
   */
  async captureFullPage(options = {}) {
    const timestamp = Date.now();
    const filename = `fullpage_${timestamp}.png`;
    const filepath = path.join(this.screenshotDir, filename);

    try {
      await this.page.screenshot({
        path: filepath,
        fullPage: true,
        ...options
      });
      console.log(`[AutoClaw] Скриншот сохранён: ${filename}`);
      return { success: true, filepath, filename };
    } catch (error) {
      console.error('[AutoClaw] Ошибка захвата скриншота:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Захват конкретного элемента
   */
  async captureElement(selector, options = {}) {
    const timestamp = Date.now();
    const filename = `element_${timestamp}.png`;
    const filepath = path.join(this.screenshotDir, filename);

    try {
      const element = await this.page.waitForSelector(selector, { timeout: 5000 });
      await element.screenshot({
        path: filepath,
        ...options
      });
      console.log(`[AutoClaw] Элемент захвачен: ${selector}`);
      return { success: true, filepath, filename };
    } catch (error) {
      console.error(`[AutoClaw] Ошибка захвата элемента ${selector}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Анализ DOM-элементов на странице
   */
  async analyzeDOM() {
    try {
      const domAnalysis = await this.page.evaluate(() => {
        const analysis = {
          totalElements: document.querySelectorAll('*').length,
          byTag: {},
          byClass: {},
          inputElements: [],
          buttonElements: [],
          formElements: [],
          links: [],
          images: []
        };

        // Подсчёт элементов по тегам
        document.querySelectorAll('*').forEach(el => {
          const tag = el.tagName.toLowerCase();
          const className = el.className;
          
          analysis.byTag[tag] = (analysis.byTag[tag] || 0) + 1;
          
          if (className) {
            const classes = className.split(' ');
            classes.forEach(cls => {
              analysis.byClass[cls] = (analysis.byClass[cls] || 0) + 1;
            });
          }

          // Категоризация элементов
          if (el.tagName === 'INPUT') analysis.inputElements.push({
            type: el.type,
            id: el.id,
            name: el.name,
            placeholder: el.placeholder
          });
          if (el.tagName === 'BUTTON') analysis.buttonElements.push({
            text: el.textContent?.trim(),
            id: el.id,
            className: el.className
          });
          if (el.tagName === 'FORM') analysis.formElements.push({
            id: el.id,
            action: el.action,
            method: el.method
          });
          if (el.tagName === 'A') analysis.links.push({
            href: el.href,
            text: el.textContent?.trim()
          });
          if (el.tagName === 'IMG') analysis.images.push({
            src: el.src,
            alt: el.alt,
            width: el.width,
            height: el.height
          });
        });

        return analysis;
      });

      console.log('[AutoClaw] DOM анализ завершён');
      return { success: true, analysis: domAnalysis };

    } catch (error) {
      console.error('[AutoClaw] Ошибка анализа DOM:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Извлечение текста из области
   */
  async extractText(selector) {
    try {
      const text = await this.page.evaluate((sel) => {
        const element = document.querySelector(sel);
        return element ? element.textContent?.trim() : null;
      }, selector);

      if (text) {
        console.log(`[AutoClaw] Текст извлечён из ${selector}: ${text.substring(0, 100)}...`);
        return { success: true, text };
      } else {
        return { success: false, error: 'Элемент не найден или пуст' };
      }
    } catch (error) {
      console.error(`[AutoClaw] Ошибка извлечения текста из ${selector}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Найти и проанализировать все изображения
   */
  async analyzeImages() {
    try {
      const images = await this.page.evaluate(() => {
        const imgElements = Array.from(document.querySelectorAll('img'));
        return imgElements.map(img => ({
          src: img.src,
          alt: img.alt,
          width: img.width,
          height: img.height,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          complete: img.complete,
          loading: img.loading
        }));
      });

      console.log(`[AutoClaw] Найдено ${images.length} изображений`);
      return { success: true, images };

    } catch (error) {
      console.error('[AutoClaw] Ошибка анализа изображений:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Комплексный анализ UI
   */
  async comprehensiveUIAnalysis() {
    const results = {};

    // 1. Захват скриншота
    results.screenshot = await this.captureFullPage();

    // 2. Анализ DOM
    results.domAnalysis = await this.analyzeDOM();

    // 3. Анализ изображений
    results.images = await this.analyzeImages();

    // 4. Поиск форм и полей ввода
    results.forms = await this.page.evaluate(() => {
      const forms = Array.from(document.querySelectorAll('form'));
      return forms.map(form => ({
        id: form.id,
        action: form.action,
        method: form.method,
        inputs: Array.from(form.querySelectorAll('input, textarea, select')).map(input => ({
          type: input.type || input.tagName.toLowerCase(),
          name: input.name,
          id: input.id,
          placeholder: input.placeholder,
          value: input.value
        }))
      }));
    });

    console.log('[AutoClaw] Комплексный анализ UI завершён');
    return { success: true, results };
  }
}

export default AutoClaw;