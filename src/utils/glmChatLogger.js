/**
 * GLM Chat Logger - логирование UUID чатов GLM
 * Простой логгер для сохранения и навигации между чатами
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Путь к файлу лога: .veai/skills/glm-chat-mcp/log/glm-chat-log.md
const LOG_FILE = path.join(__dirname, '../../../log/glm-chat-log.md');

/**
 * Извлекает UUID из URL GLM Chat
 */
function extractUUID(url) {
  if (!url) return null;
  const match = url.match(/\/c\/([a-f0-9-]{36})/);
  return match ? match[1] : null;
}

/**
 * Сохраняет запись в markdown файл с датированной структурой
 */
async function saveToFile(entry) {
  try {
    // Получить дату из timestamp или текущую дату
    const date = entry.timestamp ? new Date(entry.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const dateFolder = date.replace(/-/g, '-'); // 2026-04-01

    // Создать путь: log/2026-04-01/glm-chat-log-2026-04-01.md
    const logDir = path.join(path.dirname(LOG_FILE), dateFolder);
    const dailyLogFile = path.join(logDir, `glm-chat-log-${date}.md`);
    const indexPath = path.join(path.dirname(LOG_FILE), 'index.md');

    // Создать папку для даты
    await fs.mkdir(logDir, { recursive: true });

    // Формат строки для таблицы
    const line = `| ${date} | ${entry.timestamp?.split('T')[1]?.slice(0, 8) || ''} | ${entry.uuid} | ${entry.topic || ''} | ${entry.url} | ${entry.status || '✅ Активен'} |\n`;

    // Проверить существует ли дневной файл
    try {
      await fs.access(dailyLogFile);
    } catch {
      // Создать новый дневной файл с заголовком
      const header = `# GLM Chat Log - ${date}\n\n[← Назад к индексу](../index.md)\n\n| Дата | Время | UUID | Тема | URL | Статус |\n|------|-------|------|------|-----|--------|\n`;
      await fs.writeFile(dailyLogFile, header, 'utf-8');
    }

    // Добавить запись в дневной файл
    const content = await fs.readFile(dailyLogFile, 'utf-8');
    await fs.writeFile(dailyLogFile, content + line, 'utf-8');

    // Обновить индексный файл
    await updateIndex(indexPath, { date, uuid: entry.uuid, topic: entry.topic, url: entry.url });

    return true;
  } catch (error) {
    console.error(`GLM Logger: ${error.message}`);
    return false;
  }
}

/**
 * Обновляет индексный файл
 */
async function updateIndex(indexPath, entry) {
  try {
    let indexContent = '';

    try {
      indexContent = await fs.readFile(indexPath, 'utf-8');
    } catch {
      // Создать новый индексный файл
      indexContent = `# GLM Chat Log Index\n\n## Структура логов\n\n## Быстрый доступ к последним чатам\n\n### Сегодня (${entry.date})\n`;
    }

    // Добавить запись в индекс
    if (!indexContent.includes(entry.uuid)) {
      const entryLine = `- **${entry.uuid}** - ${entry.topic || 'Без темы'}\n  - URL: ${entry.url}\n  - Статус: ✅ Активен\n  - Файл: [${entry.date}/glm-chat-log-${entry.date}.md](${entry.date}/glm-chat-log-${entry.date}.md)\n`;

      // Вставить после "### Сегодня"
      const todayIndex = indexContent.indexOf('### Сегодня');
      if (todayIndex !== -1) {
        const beforeToday = indexContent.substring(0, todayIndex);
        const afterToday = indexContent.substring(todayIndex);
        indexContent = beforeToday + afterToday.replace('### Сегодня', `### Сегодня (${entry.date})\n${entryLine}`);
      } else {
        indexContent += `\n### ${entry.date}\n${entryLine}`;
      }

      await fs.writeFile(indexPath, indexContent, 'utf-8');
    }

    return true;
  } catch (error) {
    console.error(`GLM Logger (index): ${error.message}`);
    return false;
  }
}

/**
 * Логирует новый чат GLM
 * @param {string} url - URL чата (например, https://chat.z.ai/c/xxx-xxx)
 * @param {string} topic - Тема разговора (опционально)
 */
export async function logGLMChat(url, topic = '') {
  const uuid = extractUUID(url);
  
  if (!uuid) {
    console.log(`GLM Logger: Не удалось извлечь UUID из ${url}`);
    return null;
  }

  const entry = {
    uuid,
    url,
    topic,
    timestamp: new Date().toLocaleString('ru-RU')
  };

  console.log(`\n📝 GLM Chat:`);
  console.log(`   UUID: ${uuid}`);
  console.log(`   URL: ${url}`);
  if (topic) console.log(`   Тема: ${topic}`);

  await saveToFile(entry);
  return entry;
}

/**
 * Получает URL чата по UUID
 */
export async function getChatURL(uuid) {
  try {
    const content = await fs.readFile(LOG_FILE, 'utf-8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (line.includes(uuid)) {
        const parts = line.split('|').map(s => s.trim());
        if (parts.length >= 5) {
          return parts[4]; // URL колонка
        }
      }
    }
  } catch {
    // Файл не существует
  }
  return null;
}

/**
 * Выводит список всех чатов
 */
export async function listGLMChats() {
  try {
    const content = await fs.readFile(LOG_FILE, 'utf-8');
    console.log('\n📋 GLM Chat History:');
    console.log('═'.repeat(80));
    console.log(content);
    console.log('═'.repeat(80));
    return content;
  } catch {
    console.log('\n📋 GLM Chat History: Нет записей');
    return null;
  }
}

export default { logGLMChat, getChatURL, listGLMChats };
