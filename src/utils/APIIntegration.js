/**
 * APIIntegration — Интеграция с внешними API для AGENT GLM
 * 
 * Возможности:
 * 1. Вызов REST API
 * 2. Обработка JSON/XML ответов
 * 3. Авторизация (OAuth2, API Keys)
 * 4. Формирование запросов на основе промптов GLM
 * 
 * @version v1.0.0
 */

import fetch from 'node-fetch';
import FormData from 'form-data';

class APIIntegration {
  constructor() {
    this.apiConfigs = new Map();
    this.defaultHeaders = {
      'User-Agent': 'GLM-Agent-MCP/5.0.0',
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Регистрация API конфигурации
   */
  registerAPI(name, config) {
    this.apiConfigs.set(name, {
      baseURL: config.baseURL,
      authType: config.authType || 'none',
      credentials: config.credentials || {},
      defaultHeaders: config.headers || {},
      ...config
    });
    console.log(`[APIIntegration] API зарегистрирован: ${name}`);
  }

  /**
   * Основной метод вызова API
   */
  async callAPI(configName, endpoint, options = {}) {
    const config = this.apiConfigs.get(configName);
    if (!config) {
      throw new Error(`API конфигурация "${configName}" не найдена`);
    }

    const url = new URL(endpoint, config.baseURL).toString();
    
    const requestOptions = {
      method: options.method || 'GET',
      headers: {
        ...this.defaultHeaders,
        ...config.defaultHeaders,
        ...options.headers
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      timeout: options.timeout || 30000
    };

    // Добавление авторизации
    if (config.authType === 'bearer' && config.credentials.token) {
      requestOptions.headers['Authorization'] = `Bearer ${config.credentials.token}`;
    } else if (config.authType === 'basic' && config.credentials.username && config.credentials.password) {
      const auth = Buffer.from(`${config.credentials.username}:${config.credentials.password}`).toString('base64');
      requestOptions.headers['Authorization'] = `Basic ${auth}`;
    } else if (config.authType === 'apiKey' && config.credentials.key) {
      if (config.credentials.in === 'header') {
        requestOptions.headers[config.credentials.headerName || 'X-API-Key'] = config.credentials.key;
      } else if (config.credentials.in === 'query') {
        const urlObj = new URL(url);
        urlObj.searchParams.set(config.credentials.paramName || 'api_key', config.credentials.key);
        requestOptions.url = urlObj.toString();
      }
    }

    try {
      console.log(`[APIIntegration] Вызов API: ${requestOptions.method} ${url}`);
      
      const response = await fetch(url, requestOptions);
      const responseTime = Date.now();
      
      let responseData;
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        responseData = await response.json();
      } else if (contentType.includes('text/') || contentType.includes('application/xml')) {
        responseData = await response.text();
      } else {
        responseData = await response.arrayBuffer();
      }

      const result = {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData,
        responseTime: Date.now() - responseTime,
        url
      };

      console.log(`[APIIntegration] Ответ получен: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        console.warn(`[APIIntegration] API ошибка: ${response.status}`, result.data);
      }

      return result;

    } catch (error) {
      console.error(`[APIIntegration] Ошибка вызова API:`, error);
      return {
        success: false,
        error: error.message,
        url
      };
    }
  }

  /**
   * Парсинг промпта GLM для извлечения API запроса
   */
  parseGLMPromptForAPI(prompt) {
    const apiMatch = prompt.match(/api:(\w+):(.+?)(?=\s|$)/i);
    if (!apiMatch) return null;

    const [, apiName, action] = apiMatch;
    
    // Парсинг параметров
    const params = {};
    const paramRegex = /(\w+)=([^,\s]+)/g;
    let match;
    while ((match = paramRegex.exec(prompt)) !== null) {
      params[match[1]] = match[2];
    }

    // Парсинг тела запроса (если есть JSON)
    const jsonMatch = prompt.match(/body:\s*(\{.*?\})/s);
    if (jsonMatch) {
      try {
        params.body = JSON.parse(jsonMatch[1]);
      } catch (e) {
        console.warn('[APIIntegration] Не удалось распарсить JSON тело:', e.message);
      }
    }

    return {
      api: apiName,
      action: action.trim(),
      params,
      endpoint: this.constructEndpoint(apiName, action, params)
    };
  }

  /**
   * Построение endpoint на основе действия
   */
  constructEndpoint(apiName, action, params) {
    const config = this.apiConfigs.get(apiName);
    if (!config) return action;

    // Если action уже полный URL
    if (action.startsWith('http')) return action;

    // Если есть шаблоны endpoint
    if (config.endpointTemplates && config.endpointTemplates[action]) {
      let endpoint = config.endpointTemplates[action];
      
      // Замена параметров
      Object.keys(params).forEach(key => {
        if (params[key] && typeof params[key] === 'string') {
          endpoint = endpoint.replace(`{${key}}`, params[key]);
        }
      });

      return endpoint;
    }

    // По умолчанию добавляем к baseURL
    return `${config.baseURL.replace(/\/$/, '')}/${action}`;
  }

  /**
   * Пакетный вызов API
   */
  async batchAPICalls(calls) {
    const results = [];
    
    for (const call of calls) {
      const result = await this.callAPI(call.api, call.endpoint, {
        method: call.method,
        body: call.body,
        headers: call.headers
      });
      results.push(result);
    }
    
    return results;
  }

  /**
   * Тестирование подключения к API
   */
  async testConnection(apiName) {
    const config = this.apiConfigs.get(apiName);
    if (!config) {
      return { success: false, error: `API "${apiName}" не найден` };
    }

    try {
      const testEndpoint = config.testEndpoint || '/';
      const result = await this.callAPI(apiName, testEndpoint, {
        method: 'GET',
        timeout: 10000
      });

      return {
        success: result.success,
        api: apiName,
        status: result.status,
        responseTime: result.responseTime,
        error: result.error
      };

    } catch (error) {
      return {
        success: false,
        api: apiName,
        error: error.message
      };
    }
  }

  /**
   * Примеры предварительно настроенных API
   */
  registerCommonAPIs() {
    // GitHub API
    this.registerAPI('github', {
      baseURL: 'https://api.github.com',
      authType: 'bearer',
      credentials: { token: process.env.GITHUB_TOKEN },
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      },
      endpointTemplates: {
        'user': '/users/{username}',
        'repos': '/users/{username}/repos',
        'issues': '/repos/{owner}/{repo}/issues',
        'search': '/search/{type}'
      }
    });

    // OpenWeather API
    this.registerAPI('weather', {
      baseURL: 'https://api.openweathermap.org/data/2.5',
      authType: 'apiKey',
      credentials: {
        key: process.env.OPENWEATHER_API_KEY,
        in: 'query',
        paramName: 'appid'
      },
      endpointTemplates: {
        'current': '/weather',
        'forecast': '/forecast'
      }
    });

    console.log('[APIIntegration] Общие API зарегистрированы');
  }
}

export default APIIntegration;