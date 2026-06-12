/**
 * OCRProcessor — Распознавание текста на изображениях
 * 
 * Использует Tesseract.js для OCR
 * Возможности:
 * 1. Распознавание текста с изображений
 * 2. Поддержка множества языков
 * 3. Обработка скриншотов
 * 4. Экспорт результатов
 * 
 * @version v1.0.0
 */

import Tesseract from 'tesseract.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class OCRProcessor {
  constructor() {
    this.worker = null;
    this.ocrDir = path.join(__dirname, '..', 'ocr_results');
    this.supportedLanguages = ['eng', 'rus', 'fra', 'deu', 'spa', 'chi_sim', 'jpn'];
  }

  /**
   * Инициализация OCR процессора
   */
  async init(lang = 'eng') {
    await this.ensureOCRDirs();
    
    if (!this.supportedLanguages.includes(lang)) {
      console.warn(`[OCR] Язык "${lang}" не поддерживается, используется английский`);
      lang = 'eng';
    }

    this.worker = await Tesseract.createWorker({
      langPath: path.join(__dirname, '..', 'tessdata'),
      logger: (m) => console.log('[Tesseract]', m),
      errorHandler: (err) => console.error('[Tesseract Error]', err)
    });

    await this.worker.loadLanguage(lang);
    await this.worker.initialize(lang);
    
    console.log(`[OCR] Инициализирован с языком: ${lang}`);
    return true;
  }

  /**
   * Гарантирует наличие директорий для OCR
   */
  async ensureOCRDirs() {
    const dirs = [this.ocrDir];
    
    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
    }
  }

  /**
   * Распознавание текста с изображения
   */
  async recognize(imagePath, options = {}) {
    if (!this.worker) {
      await this.init(options.lang);
    }

    const timestamp = Date.now();
    const results = {
      image: path.basename(imagePath),
      timestamp,
      success: false,
      text: '',
      confidence: 0,
      blocks: [],
      words: [],
      hocr: '',
      tsv: '',
      pdf: ''
    };

    try {
      console.log(`[OCR] Начинаю распознавание: ${imagePath}`);

      const {
        data: {
          text,
          confidence,
          blocks,
          words,
          hocr,
          tsv,
          pdf
        }
      } = await this.worker.recognize(imagePath, {}, {
        text: true,
        hocr: true,
        tsv: true,
        pdf: true
      });

      results.success = true;
      results.text = text;
      results.confidence = confidence;
      results.blocks = blocks || [];
      results.words = words || [];
      results.hocr = hocr || '';
      results.tsv = tsv || '';
      results.pdf = pdf || '';

      // Сохранение результатов
      await this.saveResults(results, timestamp);

      console.log(`[OCR] Распознавание завершено. Текст: ${text.length} символов, Уверенность: ${confidence}%`);

      return results;

    } catch (error) {
      console.error('[OCR] Ошибка распознавания:', error);
      results.error = error.message;
      return results;
    }
  }

  /**
   * Сохранение результатов OCR
   */
  async saveResults(results, timestamp) {
    const baseName = `ocr_${timestamp}_${path.basename(results.image, path.extname(results.image))}`;
    
    try {
      // Сохранение текста
      const textFile = path.join(this.ocrDir, `${baseName}.txt`);
      await fs.writeFile(textFile, results.text);
      console.log(`[OCR] Текст сохранён: ${textFile}`);

      // Сохранение структурированных данных
      const jsonFile = path.join(this.ocrDir, `${baseName}.json`);
      await fs.writeFile(jsonFile, JSON.stringify(results, null, 2));
      console.log(`[OCR] JSON сохранён: ${jsonFile}`);

      // Сохранение HOCR если есть
      if (results.hocr) {
        const hocrFile = path.join(this.ocrDir, `${baseName}.hocr`);
        await fs.writeFile(hocrFile, results.hocr);
      }

      results.savedFiles = {
        text: textFile,
        json: jsonFile,
        hocr: results.hocr ? `${baseName}.hocr` : null
      };

    } catch (error) {
      console.error('[OCR] Ошибка сохранения результатов:', error);
    }
  }

  /**
   * Распознавание текста со скриншота страницы
   */
  async recognizeFromScreenshot(page, selector = null) {
    const timestamp = Date.now();
    const screenshotName = `ocr_screenshot_${timestamp}.png`;
    const screenshotPath = path.join(this.ocrDir, screenshotName);

    try {
      // Создание скриншота
      if (selector) {
        const element = await page.$(selector);
        if (element) {
          await element.screenshot({ path: screenshotPath });
        } else {
          await page.screenshot({ path: screenshotPath, fullPage: true });
        }
      } else {
        await page.screenshot({ path: screenshotPath, fullPage: true });
      }

      console.log(`[OCR] Скриншот сохранён: ${screenshotPath}`);

      // Распознавание текста
      const ocrResults = await this.recognize(screenshotPath);

      return {
        screenshot: screenshotPath,
        ...ocrResults
      };

    } catch (error) {
      console.error('[OCR] Ошибка распознавания со скриншота:', error);
      return {
        success: false,
        error: error.message,
        screenshot: screenshotPath
      };
    }
  }

  /**
   * Распознавание текста с нескольких изображений
   */
  async batchRecognize(imagePaths, options = {}) {
    const results = [];
    
    for (const [index, imagePath] of imagePaths.entries()) {
      console.log(`[OCR] Обработка ${index + 1}/${imagePaths.length}: ${imagePath}`);
      
      const result = await this.recognize(imagePath, options);
      results.push({
        file: imagePath,
        index: index + 1,
        ...result
      });
      
      // Пауза между обработкой для избежания перегрузки
      if (index < imagePaths.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return results;
  }

  /**
   * Анализ уверенности распознавания
   */
  analyzeConfidence(results, threshold = 70) {
    const analysis = {
      total: results.length,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0,
      failed: 0,
      averageConfidence: 0
    };

    let totalConfidence = 0;

    results.forEach(result => {
      if (!result.success) {
        analysis.failed++;
        return;
      }

      totalConfidence += result.confidence || 0;

      if (result.confidence >= threshold) {
        analysis.highConfidence++;
      } else if (result.confidence >= threshold / 2) {
        analysis.mediumConfidence++;
      } else {
        analysis.lowConfidence++;
      }
    });

    analysis.averageConfidence = analysis.total > 0 ? totalConfidence / analysis.total : 0;

    return analysis;
  }

  /**
   * Извлечение структурированной информации
   */
  extractStructuredInfo(text, patterns = {}) {
    const extracted = {};

    // Стандартные паттерны
    const defaultPatterns = {
      email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      phone: /[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{2,4}[-\s\.]?[0-9]{2,4}[-\s\.]?[0-9]{2,4}/g,
      url: /https?:\/\/(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/g,
      date: /\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}|\d{4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2}/g,
      time: /\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?/g
    };

    const allPatterns = { ...defaultPatterns, ...patterns };

    Object.entries(allPatterns).forEach(([key, pattern]) => {
      const matches = text.match(pattern);
      if (matches) {
        extracted[key] = [...new Set(matches)]; // Уникальные значения
      }
    });

    // Подсчёт слов и символов
    extracted.wordCount = text.split(/\s+/).length;
    extracted.charCount = text.length;
    extracted.lineCount = text.split('\n').length;

    return extracted;
  }

  /**
   * Очистка ресурсов
   */
  async cleanup() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      console.log('[OCR] Ресурсы очищены');
    }
  }
}

export default OCRProcessor;