/**
 * TEST 01: Send Message via Browser Memory
 * 
 * Тестирует:
 * 1. Загрузку browser_selectors.json
 * 2. findElement() с fallback
 * 3. waitForResponse()
 * 4. sendMessageWithMemory()
 */

import { chromium } from 'playwright';

// Import client
import { glmClient } from '../src/GLMChatClient.js';

async function runTest() {
  console.log('='.repeat(60));
  console.log('🧪 TEST 01: Send Message via Browser Memory');
  console.log('='.repeat(60));
  
  const testResults = {
    passed: 0,
    failed: 0,
    errors: []
  };

  try {
    // Шаг 1: Инициализация браузера
    console.log('\n📍 Шаг 1: Инициализация браузера...');
    await glmClient.init();
    console.log('✅ Браузер инициализирован');

    // Шаг 2: Открыть чат
    console.log('\n📍 Шаг 2: Открытие чата...');
    await glmClient.navigateToChat();
    console.log('✅ Чать открыт');

    // Шаг 3: Тест findElement() для chat_input
    console.log('\n📍 Шаг 3: Тест findElement("chat_input")...');
    try {
      const inputLocator = await glmClient.findElement('chat_input');
      console.log('✅ chat_input найден:', await inputLocator.toString());
      testResults.passed++;
    } catch (e) {
      console.log('❌ chat_input НЕ найден:', e.message);
      testResults.failed++;
      testResults.errors.push({ test: 'findElement(chat_input)', error: e.message });
    }

    // Шаг 4: Тест findElement() для send_button
    console.log('\n📍 Шаг 4: Тест findElement("send_button")...');
    try {
      const btnLocator = await glmClient.findElement('send_button');
      console.log('✅ send_button найден:', await btnLocator.toString());
      testResults.passed++;
    } catch (e) {
      console.log('❌ send_button НЕ найден:', e.message);
      testResults.failed++;
      testResults.errors.push({ test: 'findElement(send_button)', error: e.message });
    }

    // Шаг 5: Тест findElement() для new_chat_button
    console.log('\n📍 Шаг 5: Тест findElement("new_chat_button")...');
    try {
      const newChatLocator = await glmClient.findElement('new_chat_button');
      console.log('✅ new_chat_button найден:', await newChatLocator.toString());
      testResults.passed++;
    } catch (e) {
      console.log('⚠️ new_chat_button НЕ найден (не критично):', e.message);
      testResults.errors.push({ test: 'findElement(new_chat_button)', error: e.message, severity: 'warning' });
    }

    // Шаг 6: Отправка тестового сообщения
    console.log('\n📍 Шаг 6: Отправка тестового сообщения...');
    const testMessage = 'Привет! Это тест Browser Memory v2.0. Напиши "OK" если получил.';
    
    try {
      await glmClient.sendMessageWithMemory(testMessage);
      console.log('✅ Сообщение отправлено!');
      testResults.passed++;
    } catch (e) {
      console.log('❌ Ошибка отправки:', e.message);
      testResults.failed++;
      testResults.errors.push({ test: 'sendMessageWithMemory', error: e.message });
    }

    // Шаг 7: Получение ответа (если возможно)
    console.log('\n📍 Шаг 7: Попытка получить ответ...');
    try {
      const response = await glmClient.getLastResponse();
      if (response && response.length > 0) {
        console.log('✅ Ответ получен! (длина:', response.length, 'символов)');
        console.log('📝 Первые 200 символов ответа:');
        console.log(response.substring(0, 200) + '...');
        testResults.passed++;
      } else {
        console.log('⚠️ Ответ пустой или не найден');
        testResults.errors.push({ test: 'getLastResponse', error: 'Empty response', severity: 'warning' });
      }
    } catch (e) {
      console.log('⚠️ Не удалось получить ответ:', e.message);
      testResults.errors.push({ test: 'getLastResponse', error: e.message, severity: 'warning' });
    }

  } catch (error) {
    console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА:', error.message);
    testResults.failed++;
    testResults.errors.push({ test: 'Critical', error: error.message });
  } finally {
    // Не закрываем браузер — оставляем для дальнейшей работы
    console.log('\n' + '='.repeat(60));
    console.log('📊 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ');
    console.log('='.repeat(60));
    console.log(`✅ Пройдено: ${testResults.passed}`);
    console.log(`❌ Провалено: ${testResults.failed}`);
    
    if (testResults.errors.length > 0) {
      console.log('\n📋 Детали ошибок:');
      testResults.errors.forEach((err, i) => {
        console.log(`  ${i + 1}. [${err.severity || 'error'}] ${err.test}: ${err.error}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Тест завершён. Браузер остаётся открытым.');
    console.log('='.repeat(60));
    
    return testResults;
  }
}

// Запуск
runTest().then(results => {
  process.exit(results.failed > 0 ? 1 : 0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
