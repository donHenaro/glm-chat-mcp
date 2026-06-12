/**
 * GLM Chat Manager - управление UUID чатов GLM
 * Позволяет логировать, сохранять и переключаться между диалогами
 */

import logger from '../logger.js';
import fs from 'fs/promises';
import path from 'path';

class GLMChatManager {
  constructor() {
    this.chatsFile = path.join(process.cwd(), '.glm-chats.json');
    this.currentChatUUID = null;
    this.chatsHistory = new Map();
  }

  /**
   * Извлекает UUID чата из URL GLM
   * @param {string} url - URL чата GLM (например, https://chat.z.ai/c/8215ef55-d720-403d-a5af-299735d61aa2)
   * @returns {string|null} UUID чата или null
   */
  extractUUID(url) {
    const match = url.match(/\/c\/([a-f0-9-]{36})/);
    return match ? match[1] : null;
  }

  /**
   * Логирует новый чат GLM
   * @param {string} uuid - UUID чата
   * @param {string} title - Название/описание чата
   * @param {object} metadata - Дополнительные метаданные
   */
  async logChat(uuid, title = '', metadata = {}) {
    const chatInfo = {
      uuid,
      title: title || `Chat ${new Date().toLocaleDateString('ru-RU')}`,
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      messageCount: 0,
      metadata: {
        mode: metadata.mode || 'chat', // 'chat' или 'agent'
        purpose: metadata.purpose || '',
        tags: metadata.tags || [],
        ...metadata
      },
      url: `https://chat.z.ai/c/${uuid}`
    };

    this.chatsHistory.set(uuid, chatInfo);
    await this.saveChats();
    
    logger.info(`GLM chat logged: ${uuid} - "${title}"`);
    return chatInfo;
  }

  /**
   * Обновляет информацию о чате
   * @param {string} uuid - UUID чата
   * @param {object} updates - Обновления
   */
  async updateChat(uuid, updates) {
    const chat = this.chatsHistory.get(uuid);
    if (!chat) {
      logger.warn(`Chat not found: ${uuid}`);
      return null;
    }

    const updated = {
      ...chat,
      ...updates,
      lastAccessed: new Date().toISOString()
    };

    this.chatsHistory.set(uuid, updated);
    await this.saveChats();
    
    logger.debug(`Chat updated: ${uuid}`);
    return updated;
  }

  /**
   * Получает информацию о чате по UUID
   * @param {string} uuid - UUID чата
   */
  getChat(uuid) {
    return this.chatsHistory.get(uuid) || null;
  }

  /**
   * Получает все чаты
   */
  getAllChats() {
    return Array.from(this.chatsHistory.values());
  }

  /**
   * Ищет чаты по критериям
   * @param {object} criteria - Критерии поиска
   */
  searchChats(criteria = {}) {
    const chats = this.getAllChats();
    
    return chats.filter(chat => {
      if (criteria.title && !chat.title.toLowerCase().includes(criteria.title.toLowerCase())) {
        return false;
      }
      if (criteria.mode && chat.metadata.mode !== criteria.mode) {
        return false;
      }
      if (criteria.tag && !chat.metadata.tags.includes(criteria.tag)) {
        return false;
      }
      if (criteria.dateFrom && new Date(chat.createdAt) < new Date(criteria.dateFrom)) {
        return false;
      }
      if (criteria.dateTo && new Date(chat.createdAt) > new Date(criteria.dateTo)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Устанавливает текущий активный чат
   * @param {string} uuid - UUID чата
   */
  async setCurrentChat(uuid) {
    if (!this.chatsHistory.has(uuid)) {
      logger.error(`Cannot set current chat: UUID not found ${uuid}`);
      return false;
    }

    this.currentChatUUID = uuid;
    await this.updateChat(uuid, { lastAccessed: new Date().toISOString() });
    
    logger.info(`Current chat set to: ${uuid}`);
    return true;
  }

  /**
   * Получает текущий активный чат
   */
  getCurrentChat() {
    if (!this.currentChatUUID) {
      return null;
    }
    return this.getChat(this.currentChatUUID);
  }

  /**
   * Генерирует URL для перехода к чату
   * @param {string} uuid - UUID чата
   */
  getChatURL(uuid) {
    const chat = this.getChat(uuid);
    return chat ? chat.url : null;
  }

  /**
   * Удаляет чат из истории
   * @param {string} uuid - UUID чата
   */
  async deleteChat(uuid) {
    if (!this.chatsHistory.has(uuid)) {
      logger.warn(`Cannot delete chat: UUID not found ${uuid}`);
      return false;
    }

    this.chatsHistory.delete(uuid);
    await this.saveChats();
    
    logger.info(`Chat deleted: ${uuid}`);
    return true;
  }

  /**
   * Сохраняет историю чатов в файл
   */
  async saveChats() {
    try {
      const data = {
        version: '1.0',
        lastUpdated: new Date().toISOString(),
        currentChatUUID: this.currentChatUUID,
        chats: Array.from(this.chatsHistory.entries())
      };

      await fs.writeFile(this.chatsFile, JSON.stringify(data, null, 2));
      logger.debug('Chats history saved');
    } catch (error) {
      logger.error(`Failed to save chats: ${error.message}`);
    }
  }

  /**
   * Загружает историю чатов из файла
   */
  async loadChats() {
    try {
      const data = await fs.readFile(this.chatsFile, 'utf-8');
      const parsed = JSON.parse(data);
      
      this.currentChatUUID = parsed.currentChatUUID || null;
      this.chatsHistory = new Map(parsed.chats || []);
      
      logger.info(`Loaded ${this.chatsHistory.size} chats from history`);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.debug('No chats history file found, starting fresh');
        return false;
      }
      logger.error(`Failed to load chats: ${error.message}`);
      return false;
    }
  }

  /**
   * Экспортирует историю чатов
   */
  exportChats() {
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      chats: this.getAllChats()
    };
  }

  /**
   * Импортирует историю чатов
   * @param {object} data - Данные для импорта
   */
  async importChats(data) {
    try {
      if (data.chats && Array.isArray(data.chats)) {
        data.chats.forEach(chat => {
          this.chatsHistory.set(chat.uuid, chat);
        });
        await this.saveChats();
        logger.info(`Imported ${data.chats.length} chats`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Failed to import chats: ${error.message}`);
      return false;
    }
  }

  /**
   * Получает статистику по чатам
   */
  getStats() {
    const chats = this.getAllChats();
    return {
      totalChats: chats.length,
      agentModeChats: chats.filter(c => c.metadata.mode === 'agent').length,
      chatModeChats: chats.filter(c => c.metadata.mode === 'chat').length,
      oldestChat: chats.length > 0 ? chats.reduce((a, b) => 
        new Date(a.createdAt) < new Date(b.createdAt) ? a : b) : null,
      newestChat: chats.length > 0 ? chats.reduce((a, b) => 
        new Date(a.createdAt) > new Date(b.createdAt) ? a : b) : null
    };
  }
}

// Singleton instance
let chatManagerInstance = null;

export function getChatManager() {
  if (!chatManagerInstance) {
    chatManagerInstance = new GLMChatManager();
    chatManagerInstance.loadChats(); // Load on first access
  }
  return chatManagerInstance;
}

export default GLMChatManager;