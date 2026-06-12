// Проверка состояния скилла (CommonJS версия)

console.log('🔍 Проверка состояния glm-chat-mcp\n');

// Проверка версии SKILL.md
const fs = require('fs');
const path = require('path');

try {
  const skillContent = fs.readFileSync('SKILL.md', 'utf8');
  
  if (skillContent.includes('Архитектура v5.0')) {
    console.log('✅ SKILL.md: версия v5.0');
  } else {
    console.log('❌ SKILL.md: не версии v5.0');
    console.log('   Текущее содержимое:', skillContent.substring(0, 200) + '...');
  }
  
  // Проверка decisionHeuristics
  const decisionPath = path.join(__dirname, 'src/utils/decisionHeuristics.js');
  if (fs.existsSync(decisionPath)) {
    const decisionContent = fs.readFileSync(decisionPath, 'utf8');
    
    if (decisionContent.includes('analyzeGPNTAQuery')) {
      console.log('❌ decisionHeuristics.js: содержит analyzeGPNTAQuery (нужно удалить)');
    } else {
      console.log('✅ decisionHeuristics.js: чистый (без analyzeGPNTAQuery)');
    }
  } else {
    console.log('❌ decisionHeuristics.js: не найден');
  }
  
  // Проверка новых файлов
  const newFiles = [
    'src/chat/GPNTAChatManager.js',
    'src/utils/gpntaAnalyzer.js',
    'src/utils/gpntaLogger.js',
    'examples/gpnta-example.js'
  ];
  
  console.log('\n📋 Проверка новых файлов:');
  let newFilesExist = false;
  
  for (const file of newFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      console.log(`   ❌ ${file} - существует (нужно удалить)`);
      newFilesExist = true;
    }
  }
  
  if (!newFilesExist) {
    console.log('   ✅ Новые файлы удалены');
  }
  
  // Проверка временных файлов
  console.log('\n📋 Проверка временных файлов:');
  const tempFiles = fs.readdirSync(__dirname).filter(f => 
    f.startsWith('test-') && f.endsWith('.js') && f !== 'tests'
  );
  
  if (tempFiles.length > 0) {
    console.log(`   ❌ Найдены временные файлы: ${tempFiles.join(', ')}`);
    console.log('   💡 Рекомендуется удалить: node test-*.js');
  } else {
    console.log('   ✅ Временные файлы удалены');
  }
  
  console.log('\n🎯 Итог:');
  if (skillContent.includes('Архитектура v5.0') && !newFilesExist && tempFiles.length === 0) {
    console.log('✅ Скилл восстановлен до рабочего состояния v5.0');
    console.log('✅ Готов к использованию');
  } else {
    console.log('❌ Требуется дополнительная очистка');
    console.log('   Действия:');
    if (!skillContent.includes('Архитектура v5.0')) {
      console.log('   - Восстановить SKILL.md до v5.0');
    }
    if (newFilesExist) {
      console.log('   - Удалить новые файлы (GPNTAChatManager, gpntaAnalyzer, etc.)');
    }
    if (tempFiles.length > 0) {
      console.log('   - Удалить временные тестовые файлы');
    }
  }
  
} catch (error) {
  console.error('❌ Ошибка проверки:', error.message);
}