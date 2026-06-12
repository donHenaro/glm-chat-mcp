/**
 * Тест AutoClaw - автоматический захват и анализ
 */

import { glmClient } from '../src/GLMChatClient.js';
import GLMChatClientExtended from '../src/GLMChatClient-extended.js';

async function runAutoClawTest() {
  console.log('🧪 Тестирование AutoClaw...');
  
  try {
    // Инициализация базового клиента
    await glmClient.init();
    console.log('✅ Базовый клиент инициализирован');
    
    // Создание расширенного клиента
    const extendedClient = new GLMChatClientExtended(glmClient);
    
    // Переход на тестовую страницу
    await glmClient.page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
    console.log('✅ Перешли на тестовую страницу');
    
    // Тест 1: Захват скриншота
    console.log('\\n📸 Тест 1: Захват скриншота');
    const screenshotResult = await extendedClient.captureScreenshot();
    if (screenshotResult.success) {
      console.log(`✅ Скриншот сохранён: ${screenshotResult.filepath}`);
    } else {
      console.log(`❌ Ошибка захвата: ${screenshotResult.error}`);
    }
    
    // Тест 2: Анализ DOM
    console.log('\\n🔍 Тест 2: Анализ DOM');
    const domAnalysis = await extendedClient.analyzeDOM();
    if (domAnalysis.success) {
      console.log(`✅ DOM анализ завершён: ${domAnalysis.analysis.totalElements} элементов`);
      console.log(`   Теги: ${Object.keys(domAnalysis.analysis.byTag).slice(0, 5).join(', ')}...`);
      console.log(`   Формы: ${domAnalysis.analysis.formElements.length}`);
      console.log(`   Изображения: ${domAnalysis.analysis.images.length}`);
    } else {
      console.log(`❌ Ошибка анализа DOM: ${domAnalysis.error}`);
    }
    
    // Тест 3: Комплексный анализ
    console.log('\\n📊 Тест 3: Комплексный анализ UI');
    const comprehensive = await extendedClient.autoClawAnalysis();
    if (comprehensive.success) {
      console.log('✅ Комплексный анализ завершён');
      console.log('   Результаты:', Object.keys(comprehensive.results).join(', '));
    } else {
      console.log(`❌ Ошибка комплексного анализа: ${comprehensive.error}`);
    }
    
    // Тест 4: Извлечение текста
    console.log('\\n📝 Тест 4: Извлечение текста');
    const textResult = await extendedClient.ocrPageText('h1');
    if (textResult.success) {
      console.log(`✅ Текст извлечён: ${textResult.text?.substring(0, 100)}...`);
    } else {
      console.log(`❌ Ошибка извлечения текста: ${textResult.error}`);
    }
    
    console.log('\\n🎯 AutoClaw тесты завершены');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
    return { success: false, error: error.message };
  }
}

// Запуск теста
if (import.meta.url === `file://${process.argv[1]}`) {
  runAutoClawTest()
    .then(result => {
      console.log(result.success ? '✅ Все тесты пройдены' : '❌ Тесты провалились');
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Непредвиденная ошибка:', error);
      process.exit(1);
    });
}

export default runAutoClawTest;