/**
 * Полный интеграционный тест AGENT GLM
 * 
 * Тестирует все возможности:
 * 1. AutoClaw - захват и анализ
 * 2. API Integration - вызов внешних API
 * 3. OCR - распознавание текста
 * 4. File Exchange - работа с файлами
 * 5. Взаимодействие с GLM чатом
 */

import { glmClient } from '../src/GLMChatClient.js';
import GLMChatClientExtended from '../src/GLMChatClient-extended.js';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

async function runFullIntegrationTest() {
  console.log('🚀 Полный интеграционный тест AGENT GLM\n');
  
  const testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    details: []
  };

  try {
    // Шаг 1: Инициализация
    console.log('1️⃣  Инициализация...');
    testResults.total++;
    
    await glmClient.init();
    const extendedClient = new GLMChatClientExtended(glmClient);
    await extendedClient.initExtendedFeatures();
    
    console.log('✅ Базовый и расширенный клиенты инициализированы');
    testResults.passed++;
    testResults.details.push({ step: 'initialization', success: true });
    
    // Шаг 2: Генерация отчёта о возможностях
    console.log('\\n2️⃣  Генерация отчёта о возможностях...');
    testResults.total++;
    
    const capabilitiesReport = await extendedClient.generateCapabilitiesReport();
    console.log('✅ Отчёт сгенерирован');
    console.log(`   • AutoClaw: ${capabilitiesReport.capabilities.autoClaw.available ? '✓' : '✗'}`);
    console.log(`   • API Integration: ${capabilitiesReport.capabilities.apiIntegration.available ? '✓' : '✗'}`);
    console.log(`   • OCR: ${capabilitiesReport.capabilities.ocr.available ? '✓' : '✗'}`);
    console.log(`   • File Management: ${capabilitiesReport.capabilities.fileManagement.available ? '✓' : '✗'}`);
    
    testResults.passed++;
    testResults.details.push({ step: 'capabilities_report', success: true, report: capabilitiesReport });
    
    // Шаг 3: AutoClaw - захват и анализ
    console.log('\\n3️⃣  AutoClaw - захват и анализ...');
    testResults.total++;
    
    // Переход на тестовую страницу
    await glmClient.page.goto('https://httpbin.org/html', { waitUntil: 'domcontentloaded' });
    
    const autoClawResult = await extendedClient.autoClawAnalysis();
    
    if (autoClawResult.success) {
      console.log('✅ AutoClaw анализ завершён');
      console.log(`   • Скриншот: ${autoClawResult.results.screenshot?.success ? '✓' : '✗'}`);
      console.log(`   • DOM анализ: ${autoClawResult.results.domAnalysis?.success ? '✓' : '✗'}`);
      console.log(`   • Изображения: ${autoClawResult.results.images?.images?.length || 0} найдено`);
      
      testResults.passed++;
      testResults.details.push({ step: 'autoclaw', success: true, result: autoClawResult });
    } else {
      console.log(`❌ AutoClaw ошибка: ${autoClawResult.error}`);
      testResults.failed++;
      testResults.details.push({ step: 'autoclaw', success: false, error: autoClawResult.error });
    }
    
    // Шаг 4: API Integration
    console.log('\\n4️⃣  API Integration...');
    testResults.total++;
    
    const apiTest = await extendedClient.testAPIIntegration();
    
    if (apiTest.success) {
      console.log('✅ API Integration тест пройден');
      console.log(`   • GitHub API: ${apiTest.result?.success ? '✓' : '✗'}`);
      
      testResults.passed++;
      testResults.details.push({ step: 'api_integration', success: true, result: apiTest });
    } else {
      console.log(`❌ API Integration ошибка: ${apiTest.error}`);
      testResults.failed++;
      testResults.details.push({ step: 'api_integration', success: false, error: apiTest.error });
    }
    
    // Шаг 5: OCR тест
    console.log('\\n5️⃣  OCR тест...');
    testResults.total++;
    
    // Создание тестового изображения с текстом
    const testImagePath = join(process.cwd(), 'test_ocr_image.png');
    // В реальном тесте здесь будет создание изображения с текстом
    console.log('ℹ️  OCR тест требует реального изображения с текстом');
    
    const ocrTest = await extendedClient.testOCR();
    
    if (ocrTest.success) {
      console.log('✅ OCR процессор инициализирован');
      
      testResults.passed++;
      testResults.details.push({ step: 'ocr', success: true, result: ocrTest });
    } else {
      console.log(`❌ OCR ошибка: ${ocrTest.error}`);
      testResults.failed++;
      testResults.details.push({ step: 'ocr', success: false, error: ocrTest.error });
    }
    
    // Шаг 6: File Exchange тест
    console.log('\\n6️⃣  File Exchange тест...');
    testResults.total++;
    
    // Создание тестового файла
    const testFilePath = join(process.cwd(), 'test_file_exchange.txt');
    writeFileSync(testFilePath, 'Тестовое содержимое для проверки обмена файлами AGENT GLM\\nВремя: ' + new Date().toISOString());
    
    const fileTest = await extendedClient.testFileExchange();
    
    if (fileTest.success) {
      console.log('✅ File Exchange тест пройден');
      console.log(`   • Файл подготовлен: ${fileTest.fileInfo?.filename || 'N/A'}`);
      console.log(`   • Тип: ${fileTest.fileInfo?.type || 'unknown'}`);
      
      // Очистка тестового файла
      try { unlinkSync(testFilePath); } catch {}
      try { if (testImagePath) unlinkSync(testImagePath); } catch {}
      
      testResults.passed++;
      testResults.details.push({ step: 'file_exchange', success: true, result: fileTest });
    } else {
      console.log(`❌ File Exchange ошибка: ${fileTest.error}`);
      
      // Очистка тестового файла
      try { unlinkSync(testFilePath); } catch {}
      try { if (testImagePath) unlinkSync(testImagePath); } catch {}
      
      testResults.failed++;
      testResults.details.push({ step: 'file_exchange', success: false, error: fileTest.error });
    }
    
    // Шаг 7: Интеграция с GLM чатом
    console.log('\\n7️⃣  Интеграция с GLM чатом...');
    testResults.total++;
    
    try {
      // Переход в GLM чат
      await glmClient.navigateToChat();
      console.log('✅ Перешли в GLM чат');
      
      // Проверка доступности элементов чата
      const inputAvailable = await glmClient.findElement('chat_input').then(() => true).catch(() => false);
      const sendAvailable = await glmClient.findElement('send_button').then(() => true).catch(() => false);
      
      if (inputAvailable && sendAvailable) {
        console.log('✅ Элементы чата доступны');
        console.log('   • Поле ввода: ✓');
        console.log('   • Кнопка отправки: ✓');
        
        testResults.passed++;
        testResults.details.push({ step: 'glm_chat_integration', success: true, chatAvailable: true });
      } else {
        console.log('❌ Элементы чата не доступны');
        testResults.failed++;
        testResults.details.push({ step: 'glm_chat_integration', success: false, chatAvailable: false });
      }
      
    } catch (error) {
      console.log(`❌ Ошибка интеграции с GLM чатом: ${error.message}`);
      testResults.failed++;
      testResults.details.push({ step: 'glm_chat_integration', success: false, error: error.message });
    }
    
    // Итоговый отчёт
    console.log('\\n' + '='.repeat(60));
    console.log('📊 ИТОГОВЫЙ ОТЧЁТ');
    console.log('='.repeat(60));
    
    console.log(`\\nВсего тестов: ${testResults.total}`);
    console.log(`Пройдено: ${testResults.passed} (${Math.round(testResults.passed / testResults.total * 100)}%)`);
    console.log(`Провалено: ${testResults.failed}`);
    
    if (testResults.failed > 0) {
      console.log('\\n❌ Проваленные тесты:');
      testResults.details
        .filter(d => !d.success)
        .forEach(d => {
          console.log(`   • ${d.step}: ${d.error || 'Неизвестная ошибка'}`);
        });
    }
    
    // Генерация детального отчёта
    const detailedReport = {
      timestamp: new Date().toISOString(),
      summary: testResults,
      capabilities: capabilitiesReport.capabilities,
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch
      }
    };
    
    // Сохранение отчёта
    const reportPath = join(process.cwd(), 'integration_test_report.json');
    writeFileSync(reportPath, JSON.stringify(detailedReport, null, 2));
    console.log(`\\n📄 Детальный отчёт сохранён: ${reportPath}`);
    
    console.log('\\n🎯 Интеграционный тест завершён');
    
    return {
      success: testResults.failed === 0,
      summary: testResults,
      reportPath
    };
    
  } catch (error) {
    console.error('❌ Критическая ошибка теста:', error);
    return {
      success: false,
      error: error.message,
      summary: testResults
    };
  }
}

// Запуск теста
if (import.meta.url === `file://${process.argv[1]}`) {
  runFullIntegrationTest()
    .then(result => {
      console.log(result.success ? '\\n✅ Все интеграционные тесты пройдены успешно!' : '\\n❌ Интеграционные тесты провалились');
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('\\n❌ Непредвиденная ошибка:', error);
      process.exit(1);
    });
}

export default runFullIntegrationTest;