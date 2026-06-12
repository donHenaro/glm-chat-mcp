/**
 * GLMChatClient Extended — Расширенные возможности AGENT GLM
 * 
 * Дополняет базовый GLMChatClient:
 * - AutoClaw (автоматический захват)
 * - API Integration (вызов внешних API)
 * - OCR (распознавание текста)
 * - File Exchange (расширенный обмен файлами)
 * 
 * @version v5.0.0
 */

import { fileManager } from './utils/fileManager.js';
import AutoClaw from './utils/AutoClaw.js';
import APIIntegration from './utils/APIIntegration.js';
import OCRProcessor from './utils/OCRProcessor.js';
import { readFileSync, writeFileSync } from 'fs';

class GLMChatClientExtended {
  constructor(baseClient) {
    this.client = baseClient;
    this.autoClaw = null;
    this.apiIntegration = null;
    this.ocrProcessor = null;
    this.isExtendedInitialized = false;
  }

  /**
   * Инициализация расширенных возможностей
   */
  async initExtendedFeatures() {
    if (this.isExtendedInitialized) return;
    
    console.log('[AGENT GLM] Инициализация расширенных возможностей...');
    
    // AutoClaw
    this.autoClaw = new AutoClaw(this.client.page);
    await this.autoClaw.init();
    
    // API Integration
    this.apiIntegration = new APIIntegration();
    this.apiIntegration.registerCommonAPIs();
    
    // OCR Processor
    this.ocrProcessor = new OCRProcessor();
    
    this.isExtendedInitialized = true;
    console.log('[AGENT GLM] Расширенные возможности инициализированы');
  }

  /**
   * Автоматический захват и анализ UI
   */
  async autoClawAnalysis(selector = null) {
    await this.initExtendedFeatures();
    return await this.autoClaw.comprehensiveUIAnalysis();
  }

  /**
   * Захват скриншота элемента или страницы
   */
  async captureScreenshot(selector = null, options = {}) {
    await this.initExtendedFeatures();
    
    if (selector) {
      return await this.autoClaw.captureElement(selector, options);
    } else {
      return await this.autoClaw.captureFullPage(options);
    }
  }

  /**
   * Анализ DOM страницы
   */
  async analyzeDOM() {
    await this.initExtendedFeatures();
    return await this.autoClaw.analyzeDOM();
  }

  /**
   * Распознавание текста на странице
   */
  async ocrPageText(selector = null) {
    await this.initExtendedFeatures();
    return await this.ocrProcessor.recognizeFromScreenshot(this.client.page, selector);
  }

  /**
   * Распознавание текста с файла
   */
  async ocrFile(filePath, options = {}) {
    await this.initExtendedFeatures();
    return await this.ocrProcessor.recognize(filePath, options);
  }

  /**
   * Вызов внешнего API
   */
  async callExternalAPI(apiName, endpoint, options = {}) {
    await this.initExtendedFeatures();
    return await this.apiIntegration.callAPI(apiName, endpoint, options);
  }

  /**
   * Обработка промпта с API вызовом
   */
  async processPromptWithAPI(prompt) {
    await this.initExtendedFeatures();
    
    const apiCall = this.apiIntegration.parseGLMPromptForAPI(prompt);
    
    if (apiCall) {
      console.log(`[AGENT GLM] Обработка API вызова из промпта: ${apiCall.api} -> ${apiCall.action}`);
      
      const apiResult = await this.callExternalAPI(
        apiCall.api,
        apiCall.endpoint,
        {
          method: 'GET',
          body: apiCall.params.body,
          headers: apiCall.params.headers
        }
      );
      
      // Форматирование ответа для GLM
      const responseText = this.formatAPIResultForGLM(apiResult, apiCall);
      
      return {
        apiCall,
        apiResult,
        responseText
      };
    }
    
    return null;
  }

  /**
   * Форматирование результата API для GLM
   */
  formatAPIResultForGLM(apiResult, apiCall) {
    if (!apiResult.success) {
      return `API вызов к ${apiCall.api} не удался: ${apiResult.error || 'Неизвестная ошибка'}`;
    }
    
    const result = apiResult.data;
    
    if (typeof result === 'string') {
      return `Ответ API (${apiResult.status}): ${result.substring(0, 500)}...`;
    } else if (typeof result === 'object') {
      try {
        const jsonStr = JSON.stringify(result, null, 2);
        return `Ответ API (${apiResult.status}):\n\n\`\`\`json\n${jsonStr.substring(0, 1000)}${jsonStr.length > 1000 ? '... (обрезано)' : ''}\n\`\`\``;
      } catch {
        return `Ответ API (${apiResult.status}): Получен объект`;
      }
    }
    
    return `Ответ API (${apiResult.status}): Получен ${typeof result}`;
  }

  /**
   * Расширенная отправка файла
   */
  async sendEnhancedFile(filePath, options = {}) {
    console.log(`[AGENT GLM] Подготовка расширенной отправки файла: ${filePath}`);
    
    // Подготовка файла через FileManager
    const stagedFile = await fileManager.stageFile(filePath, {
      convert: true,
      analyze: true
    });
    
    if (!stagedFile.success) {
      throw new Error(`Подготовка файла не удалась: ${stagedFile.error}`);
    }
    
    // Определение типа файла и стратегии отправки
    const fileType = stagedFile.type;
    
    switch (fileType) {
      case 'images':
        console.log('Обнаружен файл изображения, отправка как вложение');
        // В реальной реализации здесь будет отправка через Playwright
        return await this.sendFileToGLM(stagedFile.path, options);
        
      case 'text':
      case 'code':
        // Для текстовых файлов вставляем содержимое
        const content = readFileSync(stagedFile.path, 'utf8');
        console.log(`Текстовый файл, вставка ${content.length} символов`);
        return await this.client.sendMessage(content, options);
        
      default:
        console.log(`Общий тип файла: ${fileType}, отправка как вложение`);
        return await this.sendFileToGLM(stagedFile.path, options);
    }
  }

  /**
   * Отправка файла GLM (заглушка для реализации)
   */
  async sendFileToGLM(filePath, options = {}) {
    // TODO: Реализовать фактическую отправку через Playwright
    console.log(`[AGENT GLM] Отправка файла GLM: ${filePath}`);
    return { success: true, file: filePath, sent: false, note: 'Реализация отправки файла требует доработки' };
  }

  /**
   * Обработка файлов от GLM
   */
  async processGLMFileDownload(downloadInfo) {
    console.log('[AGENT GLM] Обработка скачивания файла от GLM');
    
    const processedFile = await fileManager.processGLMDownload(downloadInfo);
    
    if (processedFile.success) {
      // Анализ файла
      if (processedFile.type === 'images') {
        // OCR анализ изображений
        const ocrResult = await this.ocrFile(processedFile.path);
        processedFile.ocr = ocrResult;
      }
      
      console.log(`[AGENT GLM] Файл от GLM обработан: ${processedFile.filename} (${processedFile.type})`);
    }
    
    return processedFile;
  }

  /**
   * Пакетная обработка файлов
   */
  async batchProcessFiles(filePaths, processor) {
    const results = [];
    
    for (const filePath of filePaths) {
      try {
        const staged = await fileManager.stageFile(filePath);
        
        if (staged.success && processor) {
          const processed = await processor(staged.path);
          results.push({ file: filePath, staged, processed });
        } else {
          results.push({ file: filePath, staged });
        }
      } catch (error) {
        results.push({ file: filePath, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Тестирование всех расширенных возможностей
   */
  async testAllFeatures() {
    console.log('[AGENT GLM] Тестирование всех расширенных возможностей...');
    
    await this.initExtendedFeatures();
    
    const tests = [
      this.testAutoClaw(),
      this.testAPIIntegration(),
      this.testOCR(),
      this.testFileExchange()
    ];
    
    const results = await Promise.allSettled(tests);
    
    const summary = {
      total: tests.length,
      passed: results.filter(r => r.status === 'fulfilled' && r.value?.success).length,
      failed: results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.success)).length,
      details: results.map((r, i) => ({
        test: ['AutoClaw', 'API', 'OCR', 'FileExchange'][i],
        status: r.status,
        value: r.status === 'fulfilled' ? r.value : r.reason
      }))
    };
    
    console.log(`[AGENT GLM] Тесты завершены: ${summary.passed}/${summary.total} успешно`);
    return summary;
  }

  async testAutoClaw() {
    try {
      const result = await this.autoClawAnalysis();
      return { feature: 'AutoClaw', success: true, result };
    } catch (error) {
      return { feature: 'AutoClaw', success: false, error: error.message };
    }
  }

  async testAPIIntegration() {
    try {
      const result = await this.apiIntegration.testConnection('github');
      return { feature: 'APIIntegration', success: result.success, result };
    } catch (error) {
      return { feature: 'APIIntegration', success: false, error: error.message };
    }
  }

  async testOCR() {
    try {
      await this.ocrProcessor.init();
      return { feature: 'OCR', success: true };
    } catch (error) {
      return { feature: 'OCR', success: false, error: error.message };
    }
  }

  async testFileExchange() {
    try {
      // Создание тестового файла
      const testFile = '/tmp/test_file.txt';
      writeFileSync(testFile, 'Тестовое содержимое для обмена файлами AGENT GLM');
      
      const staged = await fileManager.stageFile(testFile);
      
      return { 
        feature: 'FileExchange', 
        success: staged.success,
        fileInfo: staged
      };
    } catch (error) {
      return { feature: 'FileExchange', success: false, error: error.message };
    }
  }

  /**
   * Создание отчёта о возможностях
   */
  async generateCapabilitiesReport() {
    await this.initExtendedFeatures();
    
    const report = {
      timestamp: new Date().toISOString(),
      capabilities: {
        autoClaw: {
          available: !!this.autoClaw,
          features: ['screenshots', 'domAnalysis', 'uiAnalysis', 'textExtraction']
        },
        apiIntegration: {
          available: !!this.apiIntegration,
          registeredAPIs: Array.from(this.apiIntegration?.apiConfigs?.keys() || []),
          features: ['restCalls', 'authSupport', 'batchCalls']
        },
        ocr: {
          available: !!this.ocrProcessor,
          languages: this.ocrProcessor?.supportedLanguages || [],
          features: ['textRecognition', 'confidenceAnalysis', 'structuredExtraction']
        },
        fileManagement: {
          available: true,
          supportedFormats: Object.keys(fileManager.SUPPORTED_FORMATS || {}).length,
          features: ['staging', 'conversion', 'analysis', 'organization']
        }
      },
      status: 'ready'
    };
    
    return report;
  }
}

export default GLMChatClientExtended;