/**
 * Decision Heuristics — Логика автоматического выбора режимов GLM Chat
 * 
 * Реализует decision trees и матрицы для:
 * - Search Mode (simple/advanced/multi_round)
 * - Deep Think (включать/выключать)
 * - File Attachment (прикреплять файл vs вставить в текст)
 * 
@version v4.0.0
 */

import logger from '../logger.js';

// ============================================================
// FILE FORMAT HANDLING (v4.0.0)
// ============================================================

/**
 * ⚠️ Web Search — Premium Only функция!
 * selectSearchMode() сохранена для совместимости, но не используется.
 */
const SEARCH_KEYWORDS = {
  DEPRECATED: true,
  REASON: 'Web Search requires premium subscription',
};

/**
 * @deprecated Web Search — Premium Only
 * Эта функция сохранена для совместимости, но вызовы игнорируются.
 */
function selectSearchMode(query, context = {}) {
  logger.warn('selectSearchMode() is deprecated: Web Search requires premium subscription');
  return 'advanced'; // Возвращаем default
}

// ============================================================
// SUPPORTED FILE FORMATS
// ============================================================

const SUPPORTED_FORMATS = {
  // Нативно поддерживаются интерфейсом
  NATIVE: ['.pdf', '.docx', '.doc', '.xls', '.xlsx', '.ppt', '.pptx',
           '.txt', '.md', '.py', '.bmp', '.gif', '.mp4'],

  // Требуют конвертации в .txt
  REQUIRES_CONVERSION: ['.java', '.js', '.ts', '.kt', '.scala',
                         '.go', '.rs', '.cpp', '.c', '.h', '.hpp',
                         '.cs', '.rb', '.php'],

  // Всегда inline (маленькие конфиги)
  INLINE_ONLY: ['.xml', '.yml', '.yaml', '.json', '.properties',
                '.ini', '.cfg', '.conf', '.env', '.toml'],
};

/**
 * Проверяет формат файла и определяет, нужна ли конвертация
 * v4.0.0: Основано на реальных возможностях DOM (.q-textarea)
 */
function checkFileFormat(filename) {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  
  if (SUPPORTED_FORMATS.NATIVE.includes(ext)) {
    return { canAttach: true, requiresConversion: false };
  }
  
  if (SUPPORTED_FORMATS.REQUIRES_CONVERSION.includes(ext)) {
    return { canAttach: true, requiresConversion: true };
  }
  
  if (SUPPORTED_FORMATS.INLINE_ONLY.includes(ext)) {
    return { canAttach: false, requiresConversion: false };
  }
  
  // По умолчанию — пробуем вставить в текст
  logger.warn(`Unknown file format: ${ext}, will try inline paste`);
  return { canAttach: false, requiresConversion: false };
}

// ============================================================
// DEEP THINK HEURISTICS
// ============================================================

const DEEP_THINK_TRIGGERS = {
  // Ключевые слова для включения Deep Think
  STRONG: [
    // Архитектура
    'архитектур', 'микросервис', 'микросервисы', 'архитектура',
    'паттерн', 'паттерны', 'design pattern', 'проектировани',
    
    // Сложный код
    'реализуй', 'создай с нуля', 'разработай', 'оптимизируй',
    'рефакторинг', 'перепиши', 'переделай',
    
    // Безопасность
    'безопасность', 'security', 'аутентификаци', 'авторизаци',
    'шифрован', 'криптограф',
    
    // Данные
    'база данных', 'database', 'sql', 'nosql', 'миграци',
    'транзакци', 'индекс',
  ],
  
  // Слова, которые могут потребовать Deep Think
  WEAK: [
    'сложн', 'complex', 'проблем', 'issue', 'ошибк', 'error',
    'лучш', 'best practice', 'оптимальн', 'эффективн',
  ],
  
  // Слова, которые НЕ требуют Deep Think
  NEGATIVE: [
    'объясни', 'расскажи', 'what is', 'что такое',
    'пример', 'example', 'как сделать', 'how to',
    'простой', 'simple', 'базовый', 'basic',
  ],
};

/**
 * Решает, нужно ли включать Deep Think mode
 */
function shouldEnableDeepThink(query, context = {}) {
  const q = query.toLowerCase();
  
  // Проверяем STRONG триггеры
  for (const trigger of DEEP_THINK_TRIGGERS.STRONG) {
    if (q.includes(trigger)) {
      logger.info(`Deep Think: STRONG trigger "${trigger}" found`);
      return true;
    }
  }
  
  // Проверяем WEAK триггеры
  let weakCount = 0;
  for (const trigger of DEEP_THINK_TRIGGERS.WEAK) {
    if (q.includes(trigger)) {
      weakCount++;
    }
  }
  
  // Если есть 2+ weak триггера и нет negative триггеров
  if (weakCount >= 2) {
    let hasNegative = false;
    for (const trigger of DEEP_THINK_TRIGGERS.NEGATIVE) {
      if (q.includes(trigger)) {
        hasNegative = true;
        break;
      }
    }
    
    if (!hasNegative) {
      logger.info(`Deep Think: ${weakCount} WEAK triggers found`);
      return true;
    }
  }
  
  logger.debug('Deep Think: not required');
  return false;
}

// ============================================================
// FILE ATTACHMENT DECISION
// ============================================================

const FILE_CONFIG = {
  // Максимальное количество файлов для прикрепления
  MAX_ATTACHMENTS: 10,
  
  // Максимальный размер для inline вставки (символов)
  MAX_INLINE_SIZE: 10000,
  
  // Форматы, которые всегда вставляем inline
  ALWAYS_INLINE: ['.txt', '.md', '.java', '.js', '.py', '.xml', '.json', '.yaml'],
  
  // Ключевые слова, требующие файлов
  REQUIRES_FILES: [
    'анализируй код', 'review code', 'проверь код',
    'в файле', 'в коде', 'в проекте',
    'приложи', 'attach', 'файл', 'file',
  ],
};

/**
 * Решает, как обработать файлы: прикрепить или вставить в текст
 */
function decideFileAttachment(filenames, query, context = {}) {
  const q = query.toLowerCase();
  
  // Проверяем, требует ли запрос файлов
  for (const keyword of FILE_CONFIG.REQUIRES_FILES) {
    if (q.includes(keyword)) {
      logger.info(`File attachment: query requires files ("${keyword}")`);
      return { action: 'attach', reason: 'query_requires_files' };
    }
  }
  
  // Проверяем форматы файлов
  const decisions = [];
  for (const filename of filenames) {
    const formatCheck = checkFileFormat(filename);
    decisions.push({
      filename,
      ...formatCheck,
      action: formatCheck.canAttach ? 'attach' : 'inline',
    });
  }
  
  // Если все файлы можно прикрепить — прикрепляем
  if (decisions.every(d => d.action === 'attach')) {
    logger.info(`File attachment: all ${filenames.length} files can be attached`);
    return { 
      action: 'attach', 
      reason: 'all_supported_formats',
      decisions 
    };
  }
  
  // Если есть файлы для inline вставки
  logger.info(`File attachment: some files require inline paste`);
  return { 
    action: 'mixed', 
    reason: 'mixed_formats',
    decisions 
  };
}

// ============================================================
// FILE BUNDLING & CONVERSION
// ============================================================

/**
 * Объединяет несколько файлов в один Markdown для вставки
 */
function bundleFilesToMarkdown(filenames, contents) {
  let markdown = '# Attached Files\n\n';
  
  for (let i = 0; i < filenames.length; i++) {
    const filename = filenames[i];
    const content = contents[i];
    
    markdown += `## ${filename}\n\`\`\`\n`;
    markdown += content;
    markdown += '\n```\n\n';
  }
  
  return markdown;
}

/**
 * Конвертирует файл в .txt если требуется
 * v4.0.0: Упрощённая версия — только меняем расширение
 */
function convertToTxt(filename) {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) {
    return filename + '.txt';
  }
  
  const nameWithoutExt = filename.substring(0, lastDot);
  return nameWithoutExt + '.txt';
}

/**
 * Оценивает количество строк кода в запросе
 */
function estimateLineCount(query) {
  const lines = query.split('\n');
  let codeLines = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Считаем строки, которые выглядят как код
    if (trimmed && 
        (trimmed.includes('{') || 
         trimmed.includes('}') || 
         trimmed.includes(';') ||
         trimmed.includes('=') ||
         trimmed.match(/^\s*(function|class|def|var|let|const|public|private|protected)/))) {
      codeLines++;
    }
  }
  
  return codeLines;
}

/**
 * Маппинг расширений на языки для подсветки синтаксиса
 */
function mapExtensionToLang(filename) {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  
  const mapping = {
    '.java': 'java',
    '.js': 'javascript',
    '.ts': 'typescript',
    '.py': 'python',
    '.rb': 'ruby',
    '.php': 'php',
    '.cpp': 'cpp',
    '.c': 'c',
    '.cs': 'csharp',
    '.go': 'go',
    '.rs': 'rust',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.swift': 'swift',
    '.md': 'markdown',
    '.xml': 'xml',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.sql': 'sql',
    '.html': 'html',
    '.css': 'css',
  };
  
  return mapping[ext] || 'text';
}

// ============================================================
// EXPORTS
// ============================================================

export {
  selectSearchMode,
  shouldEnableDeepThink,
  decideFileAttachment,
  estimateLineCount,
  bundleFilesToMarkdown,
  mapExtensionToLang,
  checkFileFormat,
  convertToTxt,

  // Константы для конфигурации
  SEARCH_KEYWORDS,
  DEEP_THINK_TRIGGERS,
  FILE_CONFIG,
  SUPPORTED_FORMATS,  // v4.0.0: Реальные форматы из DOM
};

// Default export для удобства
export default {
  selectSearchMode,  // deprecated: premium only
  shouldEnableDeepThink,
  decideFileAttachment,
  bundleFilesToMarkdown,
  checkFileFormat,   // v4.0.0
  convertToTxt,      // v4.0.0
};