/**
 * Code Extractor — утилита извлечения кода из ответов GLM
 * 
 * Использование:
 * import { extractCodeBlocks, extractFirstCodeBlock } from './utils/codeExtractor.js';
 */

import logger from '../logger.js';

// ============================================================
// РЕГУЛЯРНЫЕ ВЫРАЖЕНИЯ
// ============================================================

const CODE_BLOCK_REGEX = /```(\w*)\n?([\s\S]*?)```/g;
const INLINE_CODE_REGEX = /`([^`]+)`/g;

// ============================================================
// LANGUAGE DETECTION
// ============================================================

/**
 * Языки программирования по ключевым словам
 */
const LANGUAGE_PATTERNS = {
  java: [
    /\bpublic\s+(class|interface|enum)\s+\w+/,
    /\bprivate\s+\w+\s+\w+\(/,
    /\bSystem\.out\./,
    /\@Override|@Autowired|@Service/,
    /\bimport\s+java\./,
  ],
  javascript: [
    /\bconst\s+\w+\s*=/,
    /\blet\s+\w+\s*=/,
    /\bfunction\s+\w+\s*\(/,
    /\=>\s*{/,
    /\bimport\s+.*\s+from\s+['"]/,
    /\bexport\s+(default\s+)?/,
  ],
  typescript: [
    /\binterface\s+\w+\s*{/,
    /\btype\s+\w+\s*=/,
    /:\s*(string|number|boolean|any)\b/,
    /<\w+>/,
  ],
  python: [
    /\bdef\s+\w+\s*\(/,
    /\bclass\s+\w+\s*:/,
    /\bimport\s+\w+/,
    /\bfrom\s+\w+\s+import/,
    /\bprint\s*\(/,
  ],
  sql: [
    /\bSELECT\s+.+\s+FROM\b/i,
    /\bINSERT\s+INTO\b/i,
    /\bUPDATE\s+\w+\s+SET\b/i,
    /\bCREATE\s+TABLE\b/i,
  ],
  bash: [
    /^#!/,
    /\becho\s+/,
    /\bexport\s+\w+=/,
    /\|\s*grep/,
  ],
};

/**
 * Определение языка по содержимому кода
 * @param {string} code - Код для анализа
 * @returns {string|null} Название языка или null
 */
export function detectLanguage(code) {
  const trimmed = code.trim();
  
  for (const [language, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        return language;
      }
    }
  }
  
  return null;
}

// ============================================================
// EXTRACTION
// ============================================================

/**
 * Извлечение всех блоков кода из текста
 * @param {string} text - Текст для парсинга
 * @returns {Array<{language: string|null, code: string}>}
 */
export function extractCodeBlocks(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const blocks = [];
  let match;

  while ((match = CODE_BLOCK_REGEX.exec(text)) !== null) {
    const language = match[1] || detectLanguage(match[2]) || 'text';
    blocks.push({
      language: language.toLowerCase(),
      code: match[2].trim(),
      fullMatch: match[0],
    });
  }

  logger.debug('Code blocks extracted', { count: blocks.length });

  return blocks;
}

/**
 * Извлечение первого блока кода
 * @param {string} text - Текст для парсинга
 * @param {string|null} language - Фильтр по языку (опционально)
 * @returns {string|null} Код или null
 */
export function extractFirstCodeBlock(text, language = null) {
  const blocks = extractCodeBlocks(text);
  
  if (blocks.length === 0) {
    return null;
  }

  if (language) {
    const filtered = blocks.find(b => b.language === language.toLowerCase());
    return filtered?.code ?? blocks[0].code;
  }

  return blocks[0].code;
}

/**
 * Извлечение всех блоков определённого языка
 * @param {string} text - Текст для парсинга
 * @param {string} language - Язык для фильтрации
 * @returns {string[]} Массив кодов
 */
export function extractCodeBlocksByLanguage(text, language) {
  const blocks = extractCodeBlocks(text);
  return blocks
    .filter(b => b.language === language.toLowerCase())
    .map(b => b.code);
}

/**
 * Извлечение всех инлайн-кодовых вставок
 * @param {string} text - Текст для парсинга
 * @returns {string[]} Массив инлайн-кодов
 */
export function extractInlineCode(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const codes = [];
  let match;

  while ((match = INLINE_CODE_REGEX.exec(text)) !== null) {
    codes.push(match[1]);
  }

  return codes;
}

// ============================================================
// PARSING HELPERS
// ============================================================

/**
 * Парсинг JSON из блока кода
 * @param {string} text - Текст для парсинга
 * @returns {object|null} Распарсенный объект или null
 */
export function extractJson(text) {
  const code = extractFirstCodeBlock(text, 'json') || extractFirstCodeBlock(text);
  
  if (!code) {
    return null;
  }

  try {
    // Убираем возможные комментарии
    const cleaned = code
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
    
    return JSON.parse(cleaned);
  } catch (e) {
    logger.warn('Failed to parse JSON from code block', { error: e.message });
    return null;
  }
}

/**
 * Извлечение URL из текста
 * @param {string} text - Текст для парсинга
 * @returns {string[]} Массив URL
 */
export function extractUrls(text) {
  const urlRegex = /https?:\/\/[^\s\)"'\]]+/g;
  return text.match(urlRegex) || [];
}

// ============================================================
// VALIDATION
// ============================================================

/**
 * Проверка наличия кода в ответе
 * @param {string} text - Текст для проверки
 * @returns {boolean}
 */
export function hasCodeBlocks(text) {
  return extractCodeBlocks(text).length > 0;
}

/**
 * Проверка наличия кода конкретного языка
 * @param {string} text - Текст для проверки
 * @param {string} language - Язык
 * @returns {boolean}
 */
export function hasCodeBlocksOfLanguage(text, language) {
  return extractCodeBlocks(text).some(b => b.language === language.toLowerCase());
}

// ============================================================
// SUMMARY
// ============================================================

/**
 * Получение структурированного резюме ответа GLM
 * @param {string} text - Текст ответа GLM
 * @returns {object}
 */
export function parseMarkdownResponse(text) {
  const codeBlocks = extractCodeBlocks(text);
  const inlineCode = extractInlineCode(text);
  const urls = extractUrls(text);

  return {
    codeBlocks,
    inlineCode,
    urls,
    hasCode: codeBlocks.length > 0,
    languages: [...new Set(codeBlocks.map(b => b.language))],
    summary: {
      totalBlocks: codeBlocks.length,
      totalInlineCodes: inlineCode.length,
      totalUrls: urls.length,
    },
  };
}
