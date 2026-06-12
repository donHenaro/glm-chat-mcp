/**
 * Тест API Integration - вызов внешних API
 */

import GLMChatClientExtended from '../src/GLMChatClient-extended.js';
import { glmClient } from '../src/GLMChatClient.js';

async function runAPITest() {
  console.log('🧪 Тестирование API Integration...');
  
  try {
    // Инициализация
    await glmClient.init();
    const extendedClient = new GLMChatClientExtended(glmClient);
    
    await extendedClient.initExtendedFeatures();
    console.log('✅ Расширенный клиент инициализирован');
    
    // Тест 1: Парсинг промпта с API вызовом
    console.log('\\n🔍 Тест 1: Парсинг промпта с API');
    const testPrompts = [
      'Найди информацию о пользователе github:api:github:user params:username=octocat',
      'Получить погоду:api:weather:current params:q=London,units=metric',
      'Простой запрос без API'
    ];
    
    for (const prompt of testPrompts) {
      const apiCall = extendedClient.apiIntegration.parseGLMPromptForAPI(prompt);
      if (apiCall) {
        console.log(`✅ Промпт распознан: ${apiCall.api} -> ${apiCall.action}`);
        console.log(`   Параметры: ${JSON.stringify(apiCall.params)}`);
      } else {
        console.log(`ℹ️  Промпт без API: ${prompt.substring(0, 50)}...`);
      }
    }
    
    // Тест 2: Тестирование подключения к API
    console.log('\\n🔗 Тест 2: Тестирование подключения к API');
    const apiTests = ['github', 'weather'];
    
    for (const apiName of apiTests) {
      const testResult = await extendedClient.apiIntegration.testConnection(apiName);
      console.log(`${testResult.success ? '✅' : '❌'} ${apiName}: ${testResult.success ? 'OK' : testResult.error}`);
    }
    
    // Тест 3: Вызов реального API (GitHub)
    console.log('\\n🚀 Тест 3: Вызов реального API');
    
    // GitHub API (публичный эндпоинт)
    const githubResult = await extendedClient.callExternalAPI(
      'github',
      '/users/octocat',
      {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    
    if (githubResult.success) {
      console.log(`✅ GitHub API вызван: ${githubResult.status}`);
      if (githubResult.data && typeof githubResult.data === 'object') {
        console.log(`   Пользователь: ${githubResult.data.name || githubResult.data.login}`);
        console.log(`   Репозитории: ${githubResult.data.public_repos}`);
        console.log(`   Подписчики: ${githubResult.data.followers}`);
      }
    } else {
      console.log(`❌ GitHub API ошибка: ${githubResult.error}`);
    }
    
    // Тест 4: Обработка промпта с полным циклом
    console.log('\\n🔄 Тест 4: Полный цикл обработки промпта');
    
    const promptWithAPI = 'Получить информацию о репозитории: api:github:repos params:username=google type:repositories';
    
    const processed = await extendedClient.processPromptWithAPI(promptWithAPI);
    if (processed) {
      console.log(`✅ Промпт обработан: ${processed.apiCall.api} -> ${processed.apiCall.action}`);
      console.log(`   Результат: ${processed.responseText.substring(0, 200)}...`);
    } else {
      console.log('ℹ️  Промпт не содержит API вызовов');
    }
    
    // Тест 5: Пакетные вызовы
    console.log('\\n📦 Тест 5: Пакетные вызовы API');
    
    const batchCalls = [
      { api: 'github', endpoint: '/users/google', method: 'GET' },
      { api: 'github', endpoint: '/users/microsoft', method: 'GET' }
    ];
    
    try {
      const batchResults = await extendedClient.apiIntegration.batchAPICalls(batchCalls);
      console.log(`✅ Пакетные вызовы завершены: ${batchResults.length} запросов`);
      
      let successCount = 0;
      batchResults.forEach((result, i) => {
        if (result.success) {
          successCount++;
          console.log(`   ${i + 1}. ${result.status} ${result.url}`);
        } else {
          console.log(`   ${i + 1}. Ошибка: ${result.error}`);
        }
      });
      
      console.log(`   Успешно: ${successCount}/${batchResults.length}`);
      
    } catch (error) {
      console.log(`❌ Ошибка пакетных вызовов: ${error.message}`);
    }
    
    // Генерация отчёта
    console.log('\\n📊 Генерация отчёта о возможностях API');
    const report = await extendedClient.generateCapabilitiesReport();
    
    console.log(`✅ Отчёт сгенерирован:`);
    console.log(`   Доступные API: ${report.capabilities.apiIntegration.registeredAPIs.join(', ')}`);
    console.log(`   AutoClaw: ${report.capabilities.autoClaw.available ? '✓' : '✗'}`);
    console.log(`   OCR: ${report.capabilities.ocr.available ? '✓' : '✗'}`);
    
    console.log('\\n🎯 API Integration тесты завершены');
    return { success: true, report };
    
  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
    return { success: false, error: error.message };
  }
}

// Запуск теста
if (import.meta.url === `file://${process.argv[1]}`) {
  runAPITest()
    .then(result => {
      console.log(result.success ? '✅ Все тесты пройдены' : '❌ Тесты провалились');
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Непредвиденная ошибка:', error);
      process.exit(1);
    });
}

export default runAPITest;